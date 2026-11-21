import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ServiceRequest } from './entities/service-request.entity';
import { CreditPolicy, creditsForMinutes } from '../time-ledger/time-ledger.service';
import {
  TimeCreditLedgerEntry,
  TimeCreditTxType,
} from '../time-ledger/entities/time-credit-ledger-entry.entity';

export const creditCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);

export function requestCreditEstimate(policy: CreditPolicy, minutes: number, helpers: number) {
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) {
    throw new BadRequestException('Choose a duration between 15 and 480 minutes.');
  }
  const total = creditCents(creditsForMinutes(minutes, policy)) * Math.max(1, helpers);
  if (!Number.isFinite(total) || total <= 0 || total > 100000) {
    throw new BadRequestException(
      'Choose a duration with a credit cost between 0.01 and 1,000 credits. Whole-hour services need at least one hour.',
    );
  }
  return total / 100;
}

/** Call only while holding the request lock (or before its creating transaction commits). */
async function wallet(m: EntityManager, user: string) {
  const [row] = await m.query('SELECT * FROM universal_time_wallets WHERE user_id=$1 FOR UPDATE', [
    user,
  ]);
  if (!row) throw new ConflictException('No time-credit wallet is available.');
  return row;
}

async function post(
  m: EntityManager,
  request: ServiceRequest,
  w: any,
  amount: number,
  type: TimeCreditTxType,
  assignment?: string,
) {
  const next = creditCents(w.balance_credits) + creditCents(amount);
  if (!Number.isSafeInteger(next) || next < 0) throw new ConflictException('Not enough available time credits.');
  w.balance_credits = next / 100;
  await m.query(
    'UPDATE universal_time_wallets SET balance_credits=$2, updated_at=now() WHERE id=$1',
    [w.id, w.balance_credits],
  );
  const repo = m.getRepository(TimeCreditLedgerEntry);
  await repo.save(
    repo.create({
      walletId: w.id,
      amount,
      balanceAfter: w.balance_credits,
      held: false,
      frozenDelta: 0,
      txType: type,
      originatingOrgId: request.organizationId,
      serviceRequestId: request.id,
      volunteerAssignmentId: assignment ?? null,
      reference: request.requestNumber,
    }),
  );
}

async function event(
  m: EntityManager,
  audit: AuditService,
  request: ServiceRequest,
  type: string,
  payload: Record<string, unknown>,
  actorId: string | null = null,
) {
  await audit.logEvent(
    {
      eventType: type,
      actorId,
      targetId: request.id,
      targetType: 'service_requests',
      organizationId: request.organizationId,
      payload,
    },
    m,
  );
}

export async function reserveRequestCredits(
  m: EntityManager,
  audit: AuditService,
  request: ServiceRequest,
  user: string,
  accepted: number | undefined,
  policy: CreditPolicy,
) {
  const amount = requestCreditEstimate(
    policy,
    request.expectedDurationMinutes,
    request.preferredVolunteers,
  );
  if (
    accepted == null ||
    !Number.isFinite(accepted) ||
    creditCents(accepted) !== creditCents(amount)
  ) {
    throw new ConflictException(
      'Review the latest credit quote and accept its maximum before booking.',
    );
  }
  const w = await wallet(m, user);
  const [restricted] = await m.query(
    `SELECT 1 FROM users u WHERE u.id=$1 AND
    (u.status<>'ACTIVE' OR EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=u.id AND r.status='ACTIVE'))`,
    [user],
  );
  if (w.status !== 'ACTIVE' || restricted)
    throw new ForbiddenException('Your wallet is unavailable for credit-backed requests.');
  request.creditPayerUserId = user;
  request.creditPolicy = policy;
  request.creditLimit = amount;
  request.creditRemaining = amount;
  request.creditCharged = 0;
  request.creditReleased = 0;
  request.creditUncovered = 0;
  await post(m, request, w, -amount, TimeCreditTxType.REQUEST_RESERVED);
  await m.save(ServiceRequest, request);
  await event(m, audit, request, 'REQUEST_CREDITS_RESERVED', { amount, policy }, user);
}

export async function chargeRequestCredits(
  m: EntityManager,
  audit: AuditService,
  request: ServiceRequest,
  assignment: string,
  helperUser: string,
  minutes: number,
) {
  if (!request.creditPayerUserId || !request.creditPolicy) return;
  if (request.creditPayerUserId === helperUser)
    throw new ForbiddenException('A member cannot earn credits from helping themselves.');
  // Both sides are locked in one global order before either wallet is changed.
  await m.query(
    `INSERT INTO universal_time_wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,
    [helperUser],
  );
  await m.query(
    'SELECT id FROM universal_time_wallets WHERE user_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[request.creditPayerUserId, helperUser]],
  );
  const w = await wallet(m, request.creditPayerUserId);
  const cost = creditCents(creditsForMinutes(minutes, request.creditPolicy));
  const charge = Math.min(cost, creditCents(request.creditRemaining));
  if (charge > 0) {
    // The escrow application and real spending cancel in the available balance.
    await post(m, request, w, charge / 100, TimeCreditTxType.REQUEST_RESERVE_APPLIED, assignment);
    await post(m, request, w, -charge / 100, TimeCreditTxType.REQUEST_CREDITS_SPENT, assignment);
  }
  request.creditRemaining = (creditCents(request.creditRemaining) - charge) / 100;
  request.creditCharged = (creditCents(request.creditCharged) + charge) / 100;
  request.creditUncovered = (creditCents(request.creditUncovered) + cost - charge) / 100;
  await m.save(ServiceRequest, request);
  await event(m, audit, request, 'REQUEST_CREDITS_CHARGED', {
    assignment,
    minutes,
    charge: charge / 100,
    uncovered: (cost - charge) / 100,
  });
}

export async function releaseRequestCredits(
  m: EntityManager,
  audit: AuditService,
  request: ServiceRequest,
) {
  if (!request.creditPayerUserId || creditCents(request.creditRemaining) <= 0) return;
  const w = await wallet(m, request.creditPayerUserId);
  const amount = Number(request.creditRemaining);
  await post(m, request, w, amount, TimeCreditTxType.REQUEST_RESERVE_RELEASED);
  request.creditReleased = (creditCents(request.creditReleased) + creditCents(amount)) / 100;
  request.creditRemaining = 0;
  await m.save(ServiceRequest, request);
  await event(m, audit, request, 'REQUEST_CREDITS_RETURNED', { amount });
}
