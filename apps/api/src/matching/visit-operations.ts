import { createHash } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** An action that reaches the server later than this was recorded offline. */
export const LATE_SEND_MS = 2 * 60_000;
/** Older than this, a saved action is no longer accepted. Matches the longest visit. */
export const OLDEST_OFFLINE_MS = 12 * 60 * 60_000;

export type VisitAction = 'START' | 'FINISH' | 'LEAVE';

/** When something happened, by the phone, and whether it reached the server late. */
export interface PhoneTime {
  at: Date;
  /** Set only when it was sent late: the time the server received it. */
  receivedLate: Date | null;
}

/**
 * The time a person tapped something on their phone (FR-OFF-01). A time still to come, from a
 * clock running ahead, counts as now. One more than 12 hours ago is too old to accept.
 */
export function phoneTime(occurredAt: string | undefined | null, now: Date): PhoneTime {
  if (!occurredAt) return { at: now, receivedLate: null };
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) throw new BadRequestException('occurredAt is not a valid time');
  if (at.getTime() > now.getTime()) return { at: now, receivedLate: null };
  if (now.getTime() - at.getTime() > OLDEST_OFFLINE_MS) {
    throw new ConflictException(
      'This was saved on the phone more than 12 hours ago, so it cannot be sent. Please tell your coordinator.',
    );
  }
  return { at, receivedLate: now.getTime() - at.getTime() > LATE_SEND_MS ? now : null };
}

/** The latest of the times given. */
export const latest = (...times: (Date | null | undefined)[]): Date =>
  new Date(
    Math.max(...times.filter((t): t is Date => Boolean(t)).map((t) => new Date(t).getTime())),
  );

export function fingerprint(details: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(details)).digest('hex');
}

/**
 * True when this operation was already done, so the caller returns the current state instead.
 * The same ID with different details is refused rather than quietly ignored (FR-OFF-03).
 * Call after locking the assignment, so two copies of one retry cannot both pass.
 */
export async function alreadyDone(
  manager: EntityManager,
  membershipId: string,
  operationId: string | undefined,
  action: VisitAction,
  assignmentId: string,
  print: string,
): Promise<boolean> {
  if (!operationId) return false;
  const rows: { action: string; assignment_id: string; fingerprint: string }[] =
    await manager.query(
      `SELECT action, assignment_id, fingerprint FROM visit_operations
        WHERE volunteer_membership_id = $1 AND client_operation_id = $2`,
      [membershipId, operationId],
    );
  const earlier = rows[0];
  if (!earlier) return false;
  if (
    earlier.action !== action ||
    earlier.assignment_id !== assignmentId ||
    earlier.fingerprint !== print
  ) {
    throw new ConflictException('This change was already sent with different details');
  }
  return true;
}

/** Records a finished operation in the same transaction as the change it made. */
export async function recordOperation(
  manager: EntityManager,
  values: {
    organizationId: string;
    membershipId: string;
    operationId: string | undefined;
    action: VisitAction;
    assignmentId: string;
    print: string;
    time: PhoneTime;
    now: Date;
  },
): Promise<void> {
  if (!values.operationId) return;
  await manager.query(
    `INSERT INTO visit_operations
       (organization_id, volunteer_membership_id, client_operation_id, action, assignment_id,
        fingerprint, occurred_at, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      values.organizationId,
      values.membershipId,
      values.operationId,
      values.action,
      values.assignmentId,
      values.print,
      values.time.at,
      values.now,
    ],
  );
}
