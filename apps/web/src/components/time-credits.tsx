'use client';

import { useEffect, useRef, useState } from 'react';
import { backend, ApiError } from '@/lib/api';
import type { Action, Field } from '@/lib/admin-types';
import {
  canResolveReview,
  creditAmount,
  creditLabel,
  creditPermissions,
  creditRetryBody,
  type CreditReview,
} from '@/lib/credit-utils';
import { indiaTime } from '@/lib/request-utils';

type Pool = {
  id: string;
  name: string;
  balanceCredits: number;
  organization: { id: string; name: string };
};
type Entry = {
  id: string;
  amount: string;
  balance_after: string;
  frozen_delta: string;
  held: boolean;
  tx_type: string;
  created_at: string;
  request_number?: string | null;
  reviewable_amount: string;
};
type History = { data: Entry[]; total: number };
type Member = {
  id: string;
  userId: string;
  membershipNumber?: string | null;
  user?: { phoneE164: string; fullName?: string | null };
};
type Wallet = {
  status: string;
  accountStatus: string;
  restricted: boolean;
  balanceCredits: number;
  frozenCredits: number;
  releasableCredits: number;
};
type Funding = {
  requestNumber: string;
  status: string;
  verifiedCredits: number;
  funding: { amount: number; source: string; createdAt: string } | null;
};
type Transfer = {
  source_entry_id: string;
  amount: string;
  created_at: string;
  review_organization_id: string;
  organization_name: string;
  recipient_label: string;
};
type Props = {
  organizationId: string;
  userId: string;
  roles: string[];
  isGlobal: boolean;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
};

function useCreditData<T>(path: string | null, version: string, onExpired: () => void) {
  const expiry = useRef(onExpired);
  useEffect(() => {
    expiry.current = onExpired;
  }, [onExpired]);
  const [state, setState] = useState<{
    path: string;
    version: string;
    data?: T;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    backend<T>(path, 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, version, data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) expiry.current();
        setState({
          path,
          version,
          error: cause instanceof Error ? cause.message : 'Unable to load credits.',
        });
      });
    return () => controller.abort();
  }, [path, version]);
  const current = state?.path === path && state.version === version ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? '', loading: !!path && !current };
}

const kind = (value: string) =>
  ({
    SERVICE_EARNED: 'Service earning',
    DONATION_SENT: 'Donation given',
    DONATION_RECEIVED: 'Donation received',
    ASSISTANCE_SPENT: 'Assistance funded',
    FRAUD_HELD: 'Moved to review hold',
    FRAUD_RELEASED: 'Review hold released',
    FROZEN_RELEASED: 'Frozen earnings released',
    CREDIT_CORRECTED: 'Credit correction',
  })[value] ?? 'Credit movement';
const reason: Field = {
  key: 'reason',
  label: 'Reason',
  type: 'textarea',
  minLength: 5,
  maxLength: 1000,
};
const amountField = (maximum: number): Field => ({
  key: 'amount',
  label: 'Credits',
  type: 'number',
  min: '0.01',
  max: String(Math.min(1000, maximum)),
  step: '0.01',
});
const memberLabel = (member: Member) =>
  [member.user?.fullName, member.membershipNumber || member.user?.phoneE164 || 'Member']
    .filter(Boolean)
    .join(' · ');

function Feedback({ error, loading }: { error: string; loading: boolean }) {
  return (
    <>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="loading-line" role="status">
          Loading credits…
        </p>
      )}
    </>
  );
}
function Pages({
  page,
  total,
  setPage,
  pending,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
  pending: boolean;
}) {
  return (
    <div className="pagination">
      <button
        className="btn btn-secondary"
        disabled={pending || page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} · {total} records
      </span>
      <button
        className="btn btn-secondary"
        disabled={pending || page * 10 >= total}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

function Ledger({
  data,
  pending,
  own,
  openReview,
}: {
  data: Entry[];
  pending: boolean;
  own?: boolean;
  openReview: (entry: Entry) => void;
}) {
  return (
    <div className="table-container glass-panel">
      <table className="custom-table">
        <caption className="sr-only">Credit transaction history</caption>
        <thead>
          <tr>
            <th>Date (IST)</th>
            <th>Activity</th>
            <th>Credits</th>
            <th>Available after</th>
            <th>Review</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.id}>
              <td>{indiaTime(entry.created_at)}</td>
              <td>
                {kind(entry.tx_type)}
                {entry.request_number && <div className="help-text">{entry.request_number}</div>}
                {entry.held && (
                  <div className="help-text">
                    {entry.tx_type === 'CREDIT_CORRECTED'
                      ? 'Deducted from frozen credits'
                      : 'Recorded in frozen credits'}
                  </div>
                )}
              </td>
              <td>
                {Number(entry.amount) > 0 ? '+' : ''}
                {creditLabel(entry.amount)}
              </td>
              <td>{creditLabel(entry.balance_after)}</td>
              <td>
                {['SERVICE_EARNED', 'DONATION_RECEIVED'].includes(entry.tx_type) &&
                Number(entry.reviewable_amount) > 0 ? (
                  <button
                    className="btn btn-secondary"
                    disabled={pending || own}
                    onClick={() => openReview(entry)}
                  >
                    Open review
                  </button>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && (
        <p className="empty-state">No credit transactions in this organization yet.</p>
      )}
    </div>
  );
}

export function TimeCredits({
  organizationId,
  userId,
  roles,
  isGlobal,
  revision,
  pending,
  openAction,
  onExpired,
}: Props) {
  const [section, setSection] = useState<'pools' | 'wallets' | 'reviews'>('pools');
  const [refresh, setRefresh] = useState(0);
  const version = `${revision}:${refresh}`;
  const base = `/organizations/${organizationId}`;
  const permissions = creditPermissions(roles, isGlobal);
  const [poolId, setPoolId] = useState('');
  const [poolPage, setPoolPage] = useState(1);
  const pools = useCreditData<{ data: Pool[] }>('/donation-pools', version, onExpired);
  const localPools =
    pools.data?.data.filter((pool) => pool.organization.id === organizationId) ?? [];
  const selectedPool = localPools.find((pool) => pool.id === poolId);
  const poolHistory = useCreditData<
    History & { balance_credits: string; frozen_credits: string; status: string }
  >(
    section === 'pools' && selectedPool
      ? `${base}/donation-pools/${poolId}/transactions?page=${poolPage}&limit=10`
      : null,
    version,
    onExpired,
  );
  const [requestPage, setRequestPage] = useState(1);
  const [requestId, setRequestId] = useState('');
  const completed = useCreditData<{
    data: {
      id: string;
      requestNumber: string;
      serviceCatalog?: { customLabelEn?: string; globalService?: { nameEn: string } };
    }[];
    total: number;
  }>(
    section === 'pools' && selectedPool
      ? `${base}/requests?status=COMPLETED&page=${requestPage}&limit=10`
      : null,
    version,
    onExpired,
  );
  const funding = useCreditData<Funding>(
    section === 'pools' && selectedPool && requestId
      ? `${base}/requests/${requestId}/credit-funding`
      : null,
    version,
    onExpired,
  );
  const [search, setSearch] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [member, setMember] = useState<Member | null>(null);
  const [walletPage, setWalletPage] = useState(1);
  const members = useCreditData<{ memberships: Member[]; total: number }>(
    section === 'wallets'
      ? `${base}/memberships?status=APPROVED&search=${encodeURIComponent(search)}&limit=10&offset=${(memberPage - 1) * 10}`
      : null,
    version,
    onExpired,
  );
  const walletHistory = useCreditData<History & { wallet: Wallet | null }>(
    section === 'wallets' && member
      ? `${base}/wallets/${member.userId}/transactions?page=${walletPage}&limit=10`
      : null,
    version,
    onExpired,
  );
  const [reviewPage, setReviewPage] = useState(1);
  const reviews = useCreditData<{ data: CreditReview[]; total: number }>(
    section === 'reviews' ? `${base}/credit-reviews?page=${reviewPage}&limit=10` : null,
    version,
    onExpired,
  );
  const [tracing, setTracing] = useState<CreditReview | null>(null);
  const [transferPage, setTransferPage] = useState(1);
  const traceReview = reviews.data?.data.find((review) => review.id === tracing?.id);
  const transfers = useCreditData<{ data: Transfer[] }>(
    section === 'reviews' && traceReview
      ? `${base}/credit-reviews/${traceReview.id}/transfers?page=${transferPage}&limit=10`
      : null,
    version,
    onExpired,
  );

  function reviewSource(
    entry: { id: string; maximum: number; label: string },
    parentReviewId?: string,
  ) {
    const retry = creditRetryBody();
    openAction({
      title: 'Open credit review',
      submitLabel: 'Hold credits for review',
      description: `${entry.label}. Up to ${creditLabel(entry.maximum)} credits can be disputed. Available credits will be held; already-frozen earnings will be reserved. A coordinator investigates before a different administrator authorizes a correction.`,
      fields: [amountField(entry.maximum), reason],
      submit: (values) =>
        backend(
          `${base}/credit-reviews`,
          'POST',
          retry({
            sourceEntryId: entry.id,
            amount: creditAmount(values.amount!, entry.maximum),
            reason: values.reason!.trim(),
            ...(parentReviewId ? { parentReviewId } : {}),
          }),
        ),
      successMessage: () =>
        'Credit review opened. The server reserved available funds for investigation.',
    });
  }

  function createPool() {
    openAction({
      title: 'Approve community pool',
      description:
        'This pool belongs to the selected organization. Members can donate to it; administrators can use its available credits to fund completed assistance.',
      submitLabel: 'Approve pool',
      fields: [
        { key: 'name', label: 'Pool name', minLength: 1, maxLength: 120 },
        { key: 'description', label: 'Purpose', type: 'textarea', optional: true, maxLength: 500 },
      ],
      submit: (values) =>
        backend(`${base}/donation-pools`, 'POST', {
          name: values.name!.trim(),
          ...(values.description?.trim() ? { description: values.description.trim() } : {}),
        }),
      successMessage: () => 'Community pool approved.',
    });
  }

  function spendPool() {
    if (!selectedPool || !poolHistory.data || !funding.data || funding.data.funding) return;
    const maximum = Math.min(
      Number(poolHistory.data.balance_credits),
      funding.data.verifiedCredits,
      1000,
    );
    const retry = creditRetryBody();
    openAction({
      title: 'Fund completed assistance',
      submitLabel: 'Spend pool credits',
      description: `${selectedPool.name} → ${funding.data.requestNumber}. This retires pool credits without paying the volunteer again. One funding contribution is allowed per request, including a partial contribution. Eligible beneficiaries receive help free regardless of this contribution.`,
      fields: [amountField(maximum), reason],
      submit: (values) =>
        backend(
          `${base}/requests/${requestId}/credit-spending`,
          'POST',
          retry({
            poolId: selectedPool.id,
            amount: creditAmount(values.amount!, maximum),
            reason: values.reason!.trim(),
          }),
        ),
      successMessage: () =>
        'Pool credits spent on the completed assistance. The beneficiary was not charged.',
    });
  }

  function investigate(review: CreditReview) {
    openAction({
      title: 'Record investigation',
      submitLabel: 'Record findings',
      description: `${review.pool_name || review.membership_number || 'Member wallet'} · ${creditLabel(review.amount)} disputed credits. Findings are recorded once. A different administrator must approve the final decision.`,
      fields: [
        {
          key: 'investigation',
          label: 'Investigation findings',
          type: 'textarea',
          minLength: 10,
          maxLength: 2000,
        },
      ],
      submit: (values) =>
        backend(`${base}/credit-reviews/${review.id}/investigation`, 'POST', {
          investigation: values.investigation!.trim(),
        }),
      successMessage: () =>
        'Investigation recorded. Independent administrator approval is now required.',
    });
  }

  function resolve(review: CreditReview, decision: 'RELEASE' | 'CORRECT') {
    openAction({
      title: decision === 'CORRECT' ? 'Approve credit correction' : 'Release review hold',
      submitLabel: decision === 'CORRECT' ? 'Approve correction' : 'Release held credits',
      description:
        decision === 'CORRECT'
          ? `Remove ${creditLabel(review.held_amount)} held credits. The original transaction remains in history. This decision is final; any unrecovered amount stays documented without creating a debt.`
          : `Return ${creditLabel(review.held_amount)} held credits to the available balance. Restricted accounts and frozen wallets must first be reinstated.`,
      fields: [
        {
          key: 'resolution',
          label: 'Decision and supporting evidence',
          type: 'textarea',
          minLength: 10,
          maxLength: 2000,
        },
      ],
      submit: (values) =>
        backend(`${base}/credit-reviews/${review.id}/resolution`, 'POST', {
          decision,
          resolution: values.resolution!.trim(),
        }),
      successMessage: () =>
        decision === 'CORRECT'
          ? 'Correction approved and recorded in the ledger.'
          : 'Review hold released.',
    });
  }

  function releaseEarnings() {
    if (!member || !walletHistory.data?.wallet) return;
    const maximum = Math.min(walletHistory.data.wallet.releasableCredits, 1000);
    const retry = creditRetryBody();
    openAction({
      title: 'Release frozen earnings',
      submitLabel: 'Release earnings',
      description: `${memberLabel(member)}. Only this organization’s held earnings are eligible. Credits reserved for a dispute remain held.`,
      fields: [amountField(maximum), reason],
      submit: (values) =>
        backend(
          `${base}/wallets/${member.userId}/release-frozen`,
          'POST',
          retry({ amount: creditAmount(values.amount!, maximum), reason: values.reason!.trim() }),
        ),
      successMessage: () => 'Frozen earnings released to the member’s available balance.',
    });
  }

  function walletStatus(status: 'ACTIVE' | 'FROZEN') {
    if (!member) return;
    const retry = creditRetryBody();
    openAction({
      title: status === 'FROZEN' ? 'Freeze member wallet' : 'Restore member wallet',
      submitLabel: status === 'FROZEN' ? 'Freeze wallet' : 'Restore wallet',
      description: `${memberLabel(member)}. This affects wallet operations across every organization. Balances are preserved. Restoring the wallet does not release frozen earnings or override account restrictions.`,
      fields: [reason],
      submit: (values) =>
        backend(
          `${base}/wallets/${member.userId}/status`,
          'POST',
          retry({ status, reason: values.reason!.trim() }),
        ),
      successMessage: () =>
        status === 'FROZEN'
          ? 'Wallet frozen across the platform.'
          : 'Wallet restored. Frozen funds remain held until separately released.',
    });
  }

  const wallet = walletHistory.data?.wallet;
  const own = member?.userId === userId;
  const activeWallet =
    wallet?.status === 'ACTIVE' && wallet.accountStatus === 'ACTIVE' && !wallet.restricted;

  return (
    <div className="credit-workspace request-workspace">
      <div className="credit-policy">
        <strong>Eligible beneficiaries receive assistance free.</strong>
        <p>
          Older people, people with disabilities and other approved beneficiaries can receive help
          regardless of their credit balance. Pool funding is voluntary.
        </p>
      </div>
      <div className="ops-tabs" role="group" aria-label="Time credit section">
        {(['pools', 'wallets', 'reviews'] as const).map((tab) => (
          <button
            key={tab}
            className="ops-tab"
            aria-pressed={section === tab}
            disabled={pending}
            onClick={() => setSection(tab)}
          >
            {
              { pools: 'Community pools', wallets: 'Member wallets', reviews: 'Credit reviews' }[
                tab
              ]
            }
          </button>
        ))}
        <button
          className="btn btn-secondary ops-refresh"
          disabled={pending}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh credits
        </button>
      </div>

      {section === 'pools' && (
        <>
          <div className="section-heading">
            <div>
              <h2>Community pools</h2>
              <p className="help-text">Approved funds for this organization’s assistance.</p>
            </div>
            {permissions.administer && (
              <button className="btn btn-primary" disabled={pending} onClick={createPool}>
                Approve pool
              </button>
            )}
          </div>
          <Feedback error={pools.error} loading={pools.loading} />
          {pools.data && (
            <div className="credit-pools">
              {localPools.map((pool) => (
                <button
                  key={pool.id}
                  className="glass-panel credit-pool"
                  disabled={pending}
                  aria-pressed={pool.id === poolId}
                  onClick={() => {
                    setPoolId(pool.id);
                    setPoolPage(1);
                    setRequestId('');
                    setRequestPage(1);
                  }}
                >
                  <strong>{pool.name}</strong>
                  <span>{creditLabel(pool.balanceCredits)} available credits</span>
                  <span className="help-text">View history and funding</span>
                </button>
              ))}
            </div>
          )}
          {pools.data && !localPools.length && (
            <p className="glass-panel empty-state">
              No active community pools in this organization.
            </p>
          )}
          <Feedback error={poolHistory.error} loading={poolHistory.loading} />
          {selectedPool && poolHistory.data && (
            <section className="glass-panel detail-panel" aria-label="Pool history">
              <h3>{selectedPool.name}</h3>
              <p>
                {creditLabel(poolHistory.data.balance_credits)} available ·{' '}
                {creditLabel(poolHistory.data.frozen_credits)} frozen
              </p>
              <Ledger
                data={poolHistory.data.data}
                pending={pending}
                openReview={(entry) =>
                  reviewSource({
                    id: entry.id,
                    maximum: Number(entry.reviewable_amount),
                    label: selectedPool.name,
                  })
                }
              />
              <Pages
                page={poolPage}
                total={poolHistory.data.total}
                setPage={setPoolPage}
                pending={pending}
              />
              {permissions.administer && (
                <section className="credit-funding" aria-label="Fund completed assistance">
                  <h3>Fund completed assistance</h3>
                  <p>
                    Choose a completed request. The contribution cannot exceed its verified service
                    credits or this pool’s available balance.
                  </p>
                  <Feedback
                    error={completed.error || funding.error}
                    loading={completed.loading || funding.loading}
                  />
                  {completed.data && (
                    <>
                      <label>
                        Completed request
                        <select
                          className="form-input"
                          value={requestId}
                          disabled={pending}
                          onChange={(event) => setRequestId(event.target.value)}
                        >
                          <option value="">Choose a request</option>
                          {completed.data.data.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.requestNumber} ·{' '}
                              {row.serviceCatalog?.customLabelEn ||
                                row.serviceCatalog?.globalService?.nameEn ||
                                'Assistance'}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!completed.data.data.length && (
                        <p className="help-text">
                          No completed requests yet. Beneficiary assistance remains free.
                        </p>
                      )}
                      <Pages
                        page={requestPage}
                        total={completed.data.total}
                        pending={pending}
                        setPage={(page) => {
                          setRequestPage(page);
                          setRequestId('');
                        }}
                      />
                    </>
                  )}
                  {funding.data && (
                    <div className="credit-funding-summary">
                      <p>{creditLabel(funding.data.verifiedCredits)} verified service credits.</p>
                      {funding.data.funding ? (
                        <p role="status">
                          Already funded: {creditLabel(funding.data.funding.amount)} credits ·{' '}
                          {funding.data.funding.source}. No further contribution is allowed.
                        </p>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={
                            pending ||
                            Number(poolHistory.data.balance_credits) < 0.01 ||
                            funding.data.verifiedCredits < 0.01 ||
                            funding.data.status !== 'COMPLETED'
                          }
                          onClick={spendPool}
                        >
                          Fund from this pool
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}
            </section>
          )}
        </>
      )}

      {section === 'wallets' && (
        <>
          <h2>Member wallets</h2>
          <p className="section-description">
            View local credit history. Wallet balances are universal; transactions shown here belong
            to this organization.
          </p>
          <label>
            Find a member
            <input
              className="form-input"
              type="search"
              placeholder="Name, membership number or phone"
              value={search}
              disabled={pending}
              onChange={(event) => {
                setSearch(event.target.value);
                setMemberPage(1);
              }}
            />
          </label>
          <Feedback
            error={members.error || walletHistory.error}
            loading={members.loading || walletHistory.loading}
          />
          {members.data && (
            <section className="glass-panel detail-panel" aria-label="Member results">
              {members.data.memberships.map((row) => (
                <div className="document-row" key={row.id}>
                  <span>{memberLabel(row)}</span>
                  <button
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => {
                      setMember(row);
                      setWalletPage(1);
                    }}
                  >
                    View {memberLabel(row)}
                  </button>
                </div>
              ))}
              {!members.data.memberships.length && (
                <p className="empty-state">No matching members.</p>
              )}
              <Pages
                page={memberPage}
                total={members.data.total}
                setPage={setMemberPage}
                pending={pending}
              />
            </section>
          )}
          {member && walletHistory.data && (
            <section className="glass-panel detail-panel" aria-label="Member credit history">
              <h3>{memberLabel(member)}</h3>
              {!wallet && <p>No time-credit wallet has been created for this member yet.</p>}
              {wallet && (
                <>
                  <p>
                    {creditLabel(wallet.balanceCredits)} available ·{' '}
                    {creditLabel(wallet.frozenCredits)} frozen
                  </p>
                  <p className="help-text">
                    Wallet: {wallet.status === 'ACTIVE' ? 'Active' : 'Frozen or closed'} · Account:{' '}
                    {wallet.accountStatus.replaceAll('_', ' ').toLowerCase()}
                    {wallet.restricted ? ' · Account restriction active' : ''}
                  </p>
                  <div className="action-row">
                    {permissions.administer && (
                      <button
                        className="btn btn-secondary"
                        disabled={
                          pending || own || !activeWallet || wallet.releasableCredits < 0.01
                        }
                        onClick={releaseEarnings}
                      >
                        Release frozen earnings
                      </button>
                    )}
                    {permissions.controlWallet && ['ACTIVE', 'FROZEN'].includes(wallet.status) && (
                      <button
                        className="btn btn-secondary"
                        disabled={
                          pending ||
                          own ||
                          (wallet.status === 'FROZEN' &&
                            (wallet.accountStatus !== 'ACTIVE' || wallet.restricted))
                        }
                        onClick={() =>
                          walletStatus(wallet.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN')
                        }
                      >
                        {wallet.status === 'FROZEN' ? 'Restore wallet' : 'Freeze wallet'}
                      </button>
                    )}
                  </div>
                  {permissions.administer && (
                    <p className="help-text">
                      {creditLabel(wallet.releasableCredits)} frozen earnings from this organization
                      are available for release. Disputed credits are excluded.
                    </p>
                  )}
                  {own && (
                    <p className="help-text">
                      Another staff member must review or release your credits.
                    </p>
                  )}
                  <Ledger
                    data={walletHistory.data.data}
                    pending={pending}
                    own={own}
                    openReview={(entry) =>
                      reviewSource({
                        id: entry.id,
                        maximum: Number(entry.reviewable_amount),
                        label: `${memberLabel(member)} · ${kind(entry.tx_type)}`,
                      })
                    }
                  />
                  <Pages
                    page={walletPage}
                    total={walletHistory.data.total}
                    setPage={setWalletPage}
                    pending={pending}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}

      {section === 'reviews' && (
        <>
          <h2>Credit reviews</h2>
          <p className="section-description">
            A coordinator records the investigation. A different administrator approves release or
            correction. Start a review from a member’s credit history or a pool transaction.
          </p>
          <Feedback error={reviews.error} loading={reviews.loading} />
          {reviews.data && (
            <>
              {reviews.data.data.map((review) => (
                <section
                  key={review.id}
                  className="glass-panel detail-panel credit-review"
                  aria-label={`Credit review for ${review.pool_name || review.membership_number || 'member wallet'}`}
                >
                  <div className="section-heading">
                    <h3>{review.pool_name || review.membership_number || 'Member wallet'}</h3>
                    <span className="badge">
                      {review.decision === 'CORRECT'
                        ? 'Corrected'
                        : review.decision === 'RELEASE'
                          ? 'Released'
                          : review.investigated_by
                            ? 'Awaiting decision'
                            : 'Awaiting investigation'}
                    </span>
                  </div>
                  <p>
                    {creditLabel(review.amount)} disputed · {creditLabel(review.held_amount)} held ·{' '}
                    {indiaTime(review.created_at)}
                  </p>
                  {review.request_number && <p className="help-text">{review.request_number}</p>}
                  <p className="credit-evidence">
                    <strong>Reason:</strong> {review.reason}
                  </p>
                  {review.investigation && (
                    <p className="credit-evidence">
                      <strong>Investigation:</strong> {review.investigation}
                    </p>
                  )}
                  {review.resolution && (
                    <p className="credit-evidence">
                      <strong>Decision:</strong> {review.resolution}
                    </p>
                  )}
                  {review.parent_review_id && (
                    <p className="help-text">Linked to an earlier review through a donation.</p>
                  )}
                  {!review.decision && review.pending_children > 0 && (
                    <p className="help-text">
                      Resolve {review.pending_children} linked review(s) before this one.
                    </p>
                  )}
                  {!review.decision &&
                    (review.opened_by === userId || review.investigated_by === userId) && (
                      <p className="help-text">
                        A different administrator must authorize this decision.
                      </p>
                    )}
                  <div className="action-row">
                    {!review.decision &&
                      !review.investigated_by &&
                      permissions.investigate &&
                      review.subject_user_id !== userId && (
                        <button
                          className="btn btn-secondary"
                          disabled={pending}
                          onClick={() => investigate(review)}
                        >
                          Record investigation
                        </button>
                      )}
                    {canResolveReview(review, userId, permissions.administer) && (
                      <>
                        <button
                          className="btn btn-secondary"
                          disabled={pending}
                          onClick={() => resolve(review, 'RELEASE')}
                        >
                          Release hold
                        </button>
                        <button
                          className="btn btn-primary"
                          disabled={pending}
                          onClick={() => resolve(review, 'CORRECT')}
                        >
                          Approve correction
                        </button>
                      </>
                    )}
                    {review.wallet_id && (
                      <button
                        className="btn btn-secondary"
                        disabled={pending}
                        onClick={() => {
                          setTracing(review);
                          setTransferPage(1);
                        }}
                      >
                        Trace donations
                      </button>
                    )}
                  </div>
                </section>
              ))}
              {!reviews.data.data.length && (
                <p className="glass-panel empty-state">No credit reviews in this organization.</p>
              )}
              <Pages
                page={reviewPage}
                total={reviews.data.total}
                setPage={(page) => {
                  setReviewPage(page);
                  setTracing(null);
                }}
                pending={pending}
              />
            </>
          )}
          {traceReview && (
            <section className="glass-panel detail-panel" aria-label="Linked donations">
              <div className="section-heading">
                <h3>Linked donations</h3>
                <button className="btn btn-secondary" onClick={() => setTracing(null)}>
                  Close donations
                </button>
              </div>
              <p>
                These are actual transfers to investigate. A transfer alone does not establish
                fraud.
              </p>
              <Feedback error={transfers.error} loading={transfers.loading} />
              {transfers.data?.data.map((transfer) => (
                <div className="document-row" key={transfer.source_entry_id}>
                  <div>
                    <strong>{transfer.recipient_label}</strong>
                    <p>
                      {creditLabel(transfer.amount)} credits · {transfer.organization_name} ·{' '}
                      {indiaTime(transfer.created_at)}
                    </p>
                  </div>
                  {!traceReview.decision &&
                    transfer.review_organization_id === organizationId &&
                    Number(traceReview.unallocated_amount) > 0 && (
                      <button
                        className="btn btn-secondary"
                        disabled={pending}
                        onClick={() =>
                          reviewSource(
                            {
                              id: transfer.source_entry_id,
                              maximum: Math.min(
                                Number(transfer.amount),
                                Number(traceReview.unallocated_amount),
                              ),
                              label: transfer.recipient_label,
                            },
                            traceReview.id,
                          )
                        }
                      >
                        Review transfer
                      </button>
                    )}
                  {transfer.review_organization_id !== organizationId && (
                    <p className="help-text">
                      Requires review by {transfer.organization_name} staff.
                    </p>
                  )}
                </div>
              ))}
              {transfers.data && !transfers.data.data.length && (
                <p className="empty-state">No linked donations on this page.</p>
              )}
              <div className="pagination">
                <button
                  className="btn btn-secondary"
                  disabled={pending || transferPage <= 1}
                  onClick={() => setTransferPage((p) => p - 1)}
                >
                  Previous transfers
                </button>
                <span>Page {transferPage}</span>
                <button
                  className="btn btn-secondary"
                  disabled={pending || !transfers.data || transfers.data.data.length < 10}
                  onClick={() => setTransferPage((p) => p + 1)}
                >
                  Next transfers
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
