# DECISIONS — Decision Log

Each significant decision, the options considered, and why the chosen one won.

## D1. Base currency: everything balances in INR

- **Options:** (a) multi-currency balances per currency; (b) convert everything to INR at
  entry time and balance in INR only.
- **Chose (b).** The group lives in India; 38 of 42 rows are INR. Multi-currency balances
  would force every "who owes whom" answer to be a vector, which nobody asked for. The
  original amount + currency + rate are stored on every row, so no information is lost.

## D2. Exchange rate: fixed 1 USD = 83.00 INR

- **Options:** (a) per-date historical rates; (b) one fixed documented rate.
- **Chose (b).** The USD spending spans 4 days of one trip; realistic daily fluctuation
  (±0.5%) moves shares by a few rupees and adds an external data dependency. The rate is a
  single seeded DB row (`expenses/migrations/0002_seed_exchange_rate.py`), so switching to
  per-date rates later means adding rows, not changing code.

## D3. Rounding: half-up to 2 decimal places, in exactly one function

- `expenses/splits.py::round_money` is the only place a rounding mode exists. Changing the
  rule (e.g. to banker's rounding) is a one-line edit.
- **Penny reconciliation:** after division, leftover paise are assigned one at a time in
  stable sorted-name order, so `Σ shares == total` exactly and results are deterministic.
  Alternative considered: leaving sums off by a paisa and tolerating drift in balances —
  rejected because drift compounds and "sum of balances == 0" becomes fuzzy.

## D4. Membership windows decide who can share a cost

- Membership has `joined_on`/`left_on` (inclusive). An expense may only split among people
  active on its date — enforced at expense creation and at import.
- This directly answers "why would March electricity affect Sam?" — it can't: Sam's window
  starts 2026-04-08.
- Guests (Dev, Kabir) are Persons with date-bounded guest memberships rather than full
  members or ad-hoc strings, so their shares are first-class and auditable.

## D5. Split resolution happens once, at write time

- **Options:** (a) recompute splits from `split_type` on every balance read; (b) resolve
  splits into `ExpenseShare` rows when the expense is written.
- **Chose (b).** Balances become simple sums over stored rows, the drill-down ("show me the
  exact expenses behind ₹2,300") is a query rather than a re-derivation, and split logic
  cannot drift between the importer and the UI.

## D6. Balance formula and sign convention

- `net = paid − own share + settlements paid − settlements received`. Positive = the group
  owes you. Verified hand-computable per member; the UI shows each component.
- Debt simplification is greedy max-debtor↔max-creditor (min cash flow), deterministic
  (ties broken by name), so the "who pays whom" list is stable across reloads.

## D7. Import is a dry run until explicitly committed

- Upload parses and detects anomalies but writes no expense/settlement/person rows.
  Destructive or interpretive changes (delete, merge, reclassify, re-split, guess) are
  `pending_approval`; commit is refused while any decision is missing.
- This is the direct implementation of "I want to approve anything the app deletes or
  changes." Auto-applied changes are limited to non-destructive normalizations (separators,
  case, rounding, FX conversion) and every one is still reported.

## D8. Duplicate policy

- Same date + same description token-set → duplicate candidate.
  - **Identical** amount/payer/participants → propose keep-first, supersede-second.
  - **Conflicting** (Thalassa: ₹2400 Aisha vs ₹2450 Rohan) → propose keeping the **later**
    entry: the later log is the correction, and the row-24 note ("I think hers is wrong")
    supports that. The user can override the winner or keep both.
- Superseded rows are kept with `status=superseded` and no shares — visible history, zero
  balance impact. Hard deletion was rejected: the group wants to see what was removed.

## D9. Negative amount = refund, zero amount = void

- The −$30 parasailing row has a note explaining a cancelled slot: intentional refund, so it
  becomes a negative expense whose negative shares reverse part of the original cost for the
  same participants. A refund is *not* an error.
- The ₹0 Swiggy row ("counted twice earlier") buys nothing and splits nothing: imported as
  `void` for audit, excluded from balances.

## D10. "Paid back" rows become settlements

- "Rohan paid Aisha back" (empty split_type) and "Sam deposit share" (single counterparty +
  payment language) are payments, not shared costs. Logging them as expenses would create
  phantom shares. Reclassification requires approval; rejecting imports them as two-person
  expenses (which yields the same net balance, but misrepresents the event).

## D11. Percentages that don't sum to 100 are never silently rescaled

- 30/30/30/20 = 110% is someone's data-entry mistake; silently rescaling would put words in
  their mouth. The row is held; approving applies proportional normalization (percentages
  as weights — mathematically the unique scale-invariant reading), or the user supplies
  corrected percentages.

## D12. Ambiguous date `5/4/2026`: propose the reading that fits the file

- May 4 (literal M/D) contradicts 5 surrounding rows; April 5 (D/M reading) contradicts 2.
  The detector counts order violations within a ±5-row window for both readings and
  proposes the better fit — but the user decides, because the file's own note admits the
  format is a mess.

## D13. Missing payer / missing currency: hold vs. assume

- Missing payer is unguessable → blocking, held out of balances until supplied.
- Missing currency has one overwhelmingly likely value (INR) → proposed but still gated on
  approval, because "a silent guess is a failing answer."

## D14. Postgres in production, SQLite fallback locally

- Requirement is relational-only: Django ORM + Supabase Postgres in production. The SQLite
  fallback keeps `manage.py` usable with zero setup; `DATABASE_URL` switches to Postgres.
  No JSONB-specific queries are used, so both engines behave identically for this app.

## D15. JWT in localStorage

- **Options:** httpOnly cookie sessions; in-memory token; localStorage.
- **Chose localStorage** for deployment simplicity (static frontend + separate API origin,
  no CSRF machinery). XSS risk is acknowledged and acceptable for this scope; the app
  renders no user-supplied HTML.

## D16. No automated test suite; invariants enforced inline

- Per project instruction, no backend test files. The correctness invariants that matter
  (Σ shares == total, Σ nets == 0) are asserted in production code paths
  (`check_integrity` runs on every balances read), and the full CSV import was verified
  end-to-end against the real file during the build.
