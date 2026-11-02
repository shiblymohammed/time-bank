export type CreditReview = {
  id: string;
  amount: number | string;
  held_amount: number | string;
  reason: string;
  opened_by: string;
  investigated_by: string | null;
  investigation: string | null;
  decision: 'RELEASE' | 'CORRECT' | null;
  resolution: string | null;
  created_at: string;
  subject_user_id?: string | null;
  membership_number?: string | null;
  pool_name?: string | null;
  request_number?: string | null;
  parent_review_id?: string | null;
  wallet_id: string | null;
  pending_children: number;
  unallocated_amount: number | string;
};

export function creditPermissions(roles: string[], global: boolean) {
  return {
    investigate: global || roles.includes('COORDINATOR'),
    administer: global || roles.includes('MUNICIPALITY_ADMIN'),
    controlWallet: global,
  };
}

export function canResolveReview(review: CreditReview, actor: string, canAdminister: boolean) {
  return (
    canAdminister &&
    !review.decision &&
    !!review.investigated_by &&
    review.opened_by !== actor &&
    review.investigated_by !== actor &&
    review.subject_user_id !== actor &&
    review.pending_children === 0
  );
}

export const creditLabel = (value: number | string) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value),
  );

export function creditAmount(value: string, maximum = 1000) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter credits with at most two decimal places.');
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > Math.min(1000, maximum)) {
    throw new Error(`Enter between 0.01 and ${creditLabel(Math.min(1000, maximum))} credits.`);
  }
  return amount;
}

/** Keep retries of an unchanged form identical, including after a lost response. */
export function creditRetryBody(newKey: () => string = () => crypto.randomUUID()) {
  let fingerprint = '';
  let key = '';
  return (body: Record<string, unknown>) => {
    const next = JSON.stringify(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)));
    if (next !== fingerprint) {
      fingerprint = next;
      key = newKey();
    }
    return { ...body, idempotencyKey: key };
  };
}
