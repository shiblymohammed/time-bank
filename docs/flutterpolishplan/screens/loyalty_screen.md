# Loyalty & Rewards Screen (`LiveLoyaltyScreen`)

## Purpose
Manages local community loyalty coins (separate from Time Credits), merchant discount offers, community achievements/certificates, milestone leaderboards, and real-time merchant redemption codes with countdown timers.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Loyalty & Rewards"* and stars badge icon.
  - Periodic polling timer (`Timer.periodic`) monitoring pending merchant code redemptions.
  - Multi-section vertical layout:
    - Active Redemption Voucher Card (if code is active).
    - Coin Balance & Public Display Name Settings.
    - Partner Merchant Offers Catalog.
    - Community Achievements & Certificate Downloads.
    - Community Leaderboard.

---

## Content & Components Breakdown

### 1. Active Redemption Code Card (Real-Time Modal / Panel)
When an offer is claimed:
- Merchant Offer Title and discount details.
- 6-digit numeric voucher / redemption PIN.
- Real-time status indicator (`PENDING` merchant scan, `REDEEMED`, `EXPIRED`).
- Automatic countdown timer.
- **"Cancel Redemption" Button:** Releases held coins if user chooses not to redeem.

### 2. Community Coin Balance Card
- Total local loyalty coins accumulated.
- History of points awarded for completed service streaks and community milestones.
- Public leaderboard display name (pseudonym/alias) text field with save action.

### 3. Local Merchant Offers List (`offers`)
- Partner store cards (local bakeries, grocery stores, pharmacies offering member discounts).
- Required coin redemption cost per voucher.
- **"Redeem Offer" Button:** Deducts coins and generates a one-time merchant verification code.

### 4. Achievements & Milestone Certificates (`achievements`)
- Milestone badges (e.g., *"10 Hours of Service"*, *"Founding Member"*).
- **"Download Certificate" Button:** Generates and downloads a signed PDF certificate of service.

### 5. Community Leaderboard
- Top contributing members / anonymous aliases ranked by service milestones.

---

## Action Buttons & Interactive Controls
1. **"Redeem Offer" Button:** Generates new redemption code via `/loyalty/redemptions`.
2. **"Cancel Code" Button:** Cancels active merchant voucher and refunds coins.
3. **"Download Certificate" Button:** Initiates PDF download via `/achievements/{id}/certificate`.
4. **"Save Alias" Button:** Updates public leaderboard display name.

