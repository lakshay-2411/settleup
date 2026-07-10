# SettleUp — Shared Expenses App

A shared-expenses web app for a flat whose membership changes over time. Tracks group
expenses across currencies, computes who-owes-whom balances with full drill-down, records
settlements, and imports a messy spreadsheet export through an anomaly-detecting,
two-phase review where every destructive change requires explicit user approval.

**Deployed app:** _URL to be added after deployment._

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript (Vite), Tailwind CSS v4, shadcn/ui, TanStack Query, React Router, motion, recharts |
| Backend | Python, Django + Django REST Framework, JWT (simplejwt), fpdf2 |
| Database | PostgreSQL (Supabase-hosted in production; SQLite fallback for local dev) |

## What's inside

- **Login** — email + password, JWT access/refresh.
- **Groups & membership windows** — members have `joined_on`/`left_on` dates; an expense
  only ever splits among people whose membership covers its date. Guests (trip visitors)
  get date-bounded memberships. The People screen tells each group's membership story as
  a timeline.
- **Expenses** — four split types (`equal`, `unequal`, `percentage`, `share`),
  multi-currency with the original amount always preserved next to the INR conversion,
  refunds as negative expenses. Added through a full-screen, amount-first flow.
- **Balances** — per-person net positions, a minimal "who pays whom" settlement plan, and
  a receipts drill-down showing every row behind any number.
- **Settlements** — record payments; pre-filled from the suggested plan.
- **CSV import — a guided journey**: upload → scan → *who are these people?* (member or
  guest, with join/leave dates) → a triage deck for the data findings (approve/reject one
  at a time, keyboard included) → commit → report. The importer detects 18 types of data
  problems, auto-applies only non-destructive normalizations (each one listed in a visible
  log), re-runs the membership-window checks once the people decisions are in, and writes
  nothing until commit — which lands in three bulk statements.
- **Import report** — stored with the batch and downloadable as **PDF** (or Markdown/JSON
  via the API): every anomaly, the policy, the user's decision, and each row's outcome.

See `SCOPE.md` for the anomaly log and database schema, and `DECISIONS.md` for why things
are the way they are.

## Local setup

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL for Postgres, or leave unset for SQLite
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
```

The API is served at `http://localhost:8000` (health check: `GET /api/health/`).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL defaults to http://localhost:8000
npm run dev
```

Open `http://localhost:5173` and register an account.

### Importing the provided export

Two supported paths:

1. **Members first (recommended):** create a group, add the flatmates with their real
   join/leave dates (e.g. Meera left 2026-03-31, Sam joined 2026-04-08), then Import →
   upload `expenses_export.csv`. All 18 anomaly types are detectable this way.
2. **Import into an empty group:** upload straight away — everyone found in the file is
   proposed to you in the *people* step, where you set member/guest and the join/leave
   dates. The window checks re-run against the dates you enter, so problems like a
   departed member on a later expense are still caught — provided you supply the real
   leave date (the file alone cannot know it).

Either way, nothing touches balances until you commit, and the report (PDF download)
lists every anomaly and the action taken.

## AI used

Built with **Claude Code** (Anthropic) as the development collaborator, directed and
reviewed line-by-line by me. `AI_USAGE.md` documents the workflow, key prompts, and
concrete cases where the AI's output was wrong and had to be caught and corrected.
