# Volunteer requests paid with time credits

Approved volunteers may request help for themselves using their available time credits. Approved recipient assistance and authorized caregiver requests retain their existing free eligibility and quota rules. Historical requests are never charged retroactively.

## Booking and consent

1. The app obtains a server quote for the selected service and duration. The estimate includes the preferred team size and the service's hourly rate, multiplier and partial-hour policy.
2. The review names the maximum credits the member authorizes. Creation must carry that exact accepted maximum; a changed price requires a fresh review.
3. In the booking transaction, the server locks the wallet and moves the maximum from available credits into the request's reservation. The same credits cannot be donated, spent or reserved again.
4. A volunteer does not need recipient eligibility to use this paid path. Staff cannot book a paid request against another person's wallet.

## Verification and settlement

Verified minutes charge the reservation using the pricing policy captured at booking. The helper's earned credits and the requester's charge commit together. Disputed or unconfirmed work is not charged. A member is never charged above their accepted maximum. Any excess verified cost is recorded as uncovered for coordinator review; helpers still earn for all independently verified work.

Each charge applies reserved credits to the wallet and immediately spends the same amount, in one transaction. These two append-only ledger postings keep balance arithmetic consistent without making the reservation spendable between transactions. They do not pay the helper twice.

Cancellation before work, unmatched expiry, and final resolution release the remaining reservation. Release restores the original wallet's available balance even when that account is unavailable; existing wallet/account restrictions continue to prevent spending. No reservation is silently forfeited.

## App and admin

- Ask Time: available balance, duration, maximum cost, remaining balance, disabled review when insufficient, refreshed quotes and explicit confirmation.
- Request details: maximum, still reserved, charged, returned and any excess requiring review; free requests retain the free-help wording.
- Wallet activity: distinct reservation, application, spending and return entries linked to the request.
- Coordinator request details: free/credit-backed distinction, pricing snapshot, team estimate, reservation totals and uncovered cost. Existing service verification and dispute controls remain the authority for payment.
- Optional post-service contributions are disabled for credit-backed requests so they cannot be funded twice.

## Verification

Test free eligibility, paid volunteer eligibility, changed quotes, insufficient/frozen wallets, duplicate and concurrent bookings, verified/rejected work, team charges and caps, cancellation and expiry, atomic rollback, private request visibility and migration rollback protection. Apply the additive migration before running the updated API. Deploy only after local API, admin and Flutter checks pass.
