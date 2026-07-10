# SCOPE — Anomaly Log & Database Schema

## Part 1: Anomaly log

Every data problem found in `expenses_export.csv`, with the policy applied. Row numbers
are 1-indexed data rows (header excluded). Detectors live in
`backend/importer/detectors.py`; policies execute in `backend/importer/committing.py`.

**Handling classes:**
- **auto** — non-destructive normalization, applied automatically but always reported.
- **approval** — destructive/interpretive; queued for the user, nothing written until decided.
- **blocking** — cannot be guessed; the row is imported as `needs_input` and excluded from
  balances until resolved.

| # | Rows | Type | Problem | Policy |
|---|---|---|---|---|
| 1 | 4, 5 | `EXACT_DUPLICATE` | "Dinner at Marina Bites" logged twice by Dev (same date, amount, payer, participants; descriptions differ only in case/punctuation) | **approval** — keep the first row, mark the second `superseded` (visible, excluded from balances) |
| 2 | 23, 24 | `CONFLICTING_DUPLICATE` | Thalassa dinner logged by both Aisha (₹2400) and Rohan (₹2450); note says Aisha's is wrong | **approval** — propose keeping the later entry (row 24, ₹2450), superseding row 23; user can override the winner or keep both |
| 3 | 6 | `THOUSANDS_SEPARATOR` | Amount `1,200` | **auto** — strip separator → `1200` |
| 4 | 9 | `SUB_UNIT_PRECISION` | Amount `899.995` (sub-paisa precision) | **auto** — round half-up to 2 dp → `900.00` (the app-wide rounding rule) |
| 5 | 8, 22, 26 | `NAME_NORMALIZATION` | `priya` (case), `rohan ` (trailing space), `Dev's friend Kabir` (possessive prefix) | **auto** — canonicalize spelling; identity unchanged |
| 6 | 10 | `NAME_ALIAS_AMBIGUOUS` | Payer `Priya S` prefix-matches Priya but is not exact | **approval** — propose alias → Priya; rejecting creates a separate person |
| 7 | 12 | `MISSING_PAYER` | House cleaning supplies has an empty `paid_by` ("can't remember who paid") | **blocking** — held as `needs_input`, excluded from balances until the user supplies the payer in review |
| 8 | 13 | `SETTLEMENT_AS_EXPENSE` | "Rohan paid Aisha back" ₹5000 — empty split_type, single counterparty | **approval** — reclassify as a settlement (reduces debt, creates no shares) |
| 9 | 37 | `SETTLEMENT_AS_EXPENSE` | "Sam deposit share" ₹15000 — Sam pays Aisha alone, note says deposit | **approval** — same reclassification |
| 10 | 14, 31 | `PERCENTAGE_SUM_INVALID` | Pizza Friday & Weekend brunch: 30+30+30+20 = **110%** | **blocking** — never silently rescale; approving normalizes proportionally (percentages become weights), or the user supplies corrected percentages |
| 11 | 19, 20, 22, 25 | `FOREIGN_CURRENCY` | Goa rows in USD (villa $540, lunch $84, parasailing $150, refund −$30) | **auto** — convert at the documented fixed rate 1 USD = 83.00 INR; original amount, currency, and rate stored and shown on every row |
| 12 | 25 | `NEGATIVE_AMOUNT_REFUND` | Parasailing refund −$30 ("one slot got cancelled") | **auto** — treated as an intentional refund, not an error: negative shares flow back to the same four participants |
| 13 | 4, 5, 18–26 | `NON_MEMBER_PARTICIPANT` | Dev appears in 11 rows but is not a flat member | **approval** — create Dev as a **guest** with membership 2026-02-08 → 2026-03-14 (exactly his appearance window); rejecting re-splits among the rest |
| 14 | 22 | `NON_MEMBER_PARTICIPANT` | "Dev's friend Kabir" joins parasailing for one day | **approval** — guest membership for 2026-03-11 only, so the 5-way split charges Kabir his own share |
| 15 | 27 | `MISSING_CURRENCY` | Groceries DMart 3/15 has an empty currency ("forgot to set currency") | **approval** — propose INR (base currency, matches every similar row) but never assume silently |
| 16 | 26 | `AMBIGUOUS_DATE` (auto) | `Mar-14` has no year | **auto** — infer 2026 (single-year file) |
| 17 | 33 | `AMBIGUOUS_DATE` (approval) | `5/4/2026` ("is this April 5 or May 4?") — May 4 contradicts 5 neighboring rows; April 5 fits | **approval** — propose 2026-04-05 (fits file order); rejecting keeps the literal May 4 |
| 18 | 33 | `OUT_OF_ORDER_ROW` | The row sits out of date order in the file | **auto/info** — cosmetic; the app displays by resolved date |
| 19 | 30 | `ZERO_AMOUNT` | Swiggy dinner ₹0 ("counted twice earlier - fixing later") | **auto** — imported as `void`: visible for audit, excluded from balances |
| 20 | 35 | `DEPARTED_MEMBER_IN_SPLIT` | Groceries 4/2 still lists Meera, who left 2026-03-31 | **approval** — drop Meera and re-split among members active on the date (Aisha, Rohan, Priya); rejecting keeps the file's split |
| 21 | 41 | `SPLITTYPE_DETAIL_MISMATCH` | Furniture row says `equal` but share weights were also entered | **auto** — `split_type` is the source of truth: split equally, ignore the stray weights (which agree with equal anyway) |

**Import outcome for the provided file (default decisions):** 42 rows → 37 active expenses,
2 superseded duplicates, 1 void, 2 settlements. 24 anomaly records across 18 types.

**Two-phase review.** People decisions (`NON_MEMBER_PARTICIPANT`, `NAME_ALIAS_AMBIGUOUS`)
are made first — each unknown person gets a role (member/guest) and join/leave dates. The
moment the last people decision lands, the window-dependent check (#20) re-runs against
the supplied dates, so importing into an *empty* group still catches a departed member on
a later expense — if the user enters the real leave date, which the file alone cannot
provide. Missing-payer anomalies (#7) offer the row's own participants as payer
candidates, since whoever paid must be one of the people the cost was split among.

## Part 2: Database schema

PostgreSQL via Django ORM. Money columns are `DECIMAL(12,2)`; FX rates `DECIMAL(12,6)`.

```
accounts_user                 custom auth user; email is the login identifier
  id, username, email (unique), name, password, …

groups_person                 a human in expenses; may have no login (guests)
  id, name (unique), display_name, user_id → accounts_user (nullable), is_guest

groups_group
  id, name, base_currency ('INR'), created_by_id → accounts_user, created_at

groups_membership             who was in the group when (source of truth for splits)
  id, group_id → groups_group, person_id → groups_person
  joined_on DATE, left_on DATE NULL (inclusive), role ('member'|'guest')
  UNIQUE (group_id, person_id)

expenses_exchangerate         seeded conversion rates (1 USD = 83.00 INR)
  id, base, quote, rate DECIMAL(12,6), as_of DATE, source

expenses_expense
  id, group_id → groups_group, date DATE, description
  payer_id → groups_person NULL (only while needs_input)
  original_amount DECIMAL(12,2), original_currency
  amount_inr DECIMAL(12,2), fx_rate DECIMAL(12,6) NULL, fx_rate_date NULL
  split_type ('equal'|'unequal'|'percentage'|'share'), split_raw JSONB
  notes, status ('active'|'needs_input'|'void'|'superseded'|'pending_approval')
  is_refund BOOL, source_import_id → importer_importbatch NULL,
  source_row_number INT NULL, created_at, created_by_id NULL

expenses_expenseshare         resolved per-person amounts; Σ shares == amount_inr exactly
  id, expense_id → expenses_expense, person_id → groups_person
  share_amount_inr DECIMAL(12,2), weight DECIMAL(12,4) NULL
  UNIQUE (expense_id, person_id)

expenses_settlement           a payment between two people (not a shared cost)
  id, group_id, date, from_person_id → groups_person, to_person_id → groups_person
  original_amount, original_currency, amount_inr, fx_rate NULL
  notes, source_import_id NULL, source_row_number NULL, created_at

importer_importbatch          one import run (dry-run until committed)
  id, group_id, uploaded_by_id, uploaded_at, filename, total_rows
  status ('parsing'|'awaiting_approval'|'committed')
  rows_json JSONB (normalized rows + proposed actions)
  report_json JSONB (the import report — PDF/Markdown are rendered from this on demand)
  reanalyzed BOOL (window checks re-run once, after the last people decision)

importer_importanomaly        one detected problem + the decision made about it
  id, batch_id → importer_importbatch, anomaly_type, severity ('info'|'warning'|'blocking')
  source_row_numbers JSONB, description, policy
  status ('auto_applied'|'pending_approval'|'approved'|'rejected')
  before_json, after_json, resolution_json JSONB
  resolved_by_id NULL, resolved_at NULL
```

**Key invariants (enforced in code — `ledger/balances.py`, `expenses/splits.py`):**
- For every expense, `Σ ExpenseShare.share_amount_inr == amount_inr` exactly
  (penny reconciliation in `splits._reconcile`).
- For every group, `Σ net balances == 0` — checked on every balances read
  (`check_integrity`).
- Only `active` expenses contribute to balances; `needs_input` / `void` / `superseded`
  rows are stored for audit but carry no shares.
- A person's shares only exist on expenses whose date their membership window covers
  (enforced at expense creation and at import).
