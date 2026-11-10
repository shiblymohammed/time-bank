# Complaints & Grievances Screen (`LiveComplaintsScreen`)

## Purpose
Enables members to submit confidential grievances, report violations, view past complaints filed with the chapter committee, track dispute resolution findings, and file formal appeals against decisions.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Complaints"* and report icon.
  - Informational preamble reassuring confidentiality and impartial committee review.
  - Primary button to lodge a new complaint.
  - List of complaint tracking cards (`Panel`) with resolution summaries and appeal buttons.

---

## Content & Components Breakdown

### 1. Confidentiality Preamble
- Reassures members that submissions are kept private from other members and investigated impartially by authorized community dispute officers.

### 2. Lodged Complaint Cards (`card`)
Each historical or open grievance displays:
- **Complaint Category:** e.g., *"Service quality"*, *"Safety violation"*, *"No-show"*, *"Harassment / Code of conduct"*.
- **Status Chip (`StatusChip`):** e.g., `Under Investigation`, `Resolved`, `Closed`.
- **Reference Identifier:** Grievance ticket number (e.g., `GRV-2026-031`).
- **Date & Time:** Submission timestamp.
- **Related Request:** Associated request code (if related to a specific visit).
- **Description:** Member's submitted statement.
- **Committee Finding:** Coordinator's written outcome report (*"What we found: ..."*).
- **Appeal Status Line:** Notice indicating whether an appeal is currently under external review.

---

## Action Buttons & Dialog Triggers
1. **"Make a complaint" Button:**
   - Opens grievance dialog collecting complaint category, related request ID, and multi-line detailed statement.
2. **"Challenge this outcome" / Appeal Button:**
   - Available on closed grievances where `canAppeal == true`.
   - Opens appeal dialog collecting grounds for appeal and routes it to an independent reviewer.

