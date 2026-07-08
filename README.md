# SettleUp — Shared Expenses App

A shared-expenses web app for a flat whose membership changes over time. Tracks group
expenses across currencies, computes who-owes-whom balances with full drill-down, records
settlements, and imports a messy spreadsheet export through an anomaly-detecting import
pipeline where every destructive change requires explicit user approval.

**Deployed app:** _URL to be added after deployment._

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript (Vite), Tailwind CSS, TanStack Query, React Router |
| Backend | Python, Django + Django REST Framework, JWT (simplejwt) |
| Database | PostgreSQL (Supabase-hosted in production; SQLite fallback for local dev) |

## What's inside

- **Login** — email + password, JWT access/refresh.
- **Groups & membership windows** — members have `joined_on`/`left_on` dates; an expense
  only ever splits among people whose membership covers its date. Guests (trip visitors)
  get date-bounded memberships.
- **Expenses** — four split types (`equal`, `unequal`, `percentage`, `share`), multi-currency
  with the original amount always preserved next to the INR conversion, refunds as negative
  expenses.
- **Balances** — per-person net positions, a minimal "who pays whom" settlement plan, and a
  drill-down showing every row behind any number.
- **Settlements** — record payments; pre-fillable from the suggested plan.
- **CSV import** — parses the export exactly as provided, detects 18 types of data problems,
  auto-applies only non-destructive normalizations, queues everything destructive for
  approval, then produces a downloadable import report.

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

Open `http://localhost:5173`, register an account, create a group, add the members with
their join/leave dates, then import the CSV from the group's **Import** tab.

### Importing the provided export

1. Create a group and add members with their real membership windows
   (e.g. Meera left on 2026-03-31, Sam joined on 2026-04-08).
2. Group → **Import** → upload `expenses_export.csv`.
3. Review the detected anomalies: auto-applied normalizations are listed for transparency;
   everything destructive waits in **Needs your decision**.
4. Commit. The import report (JSON in-app, Markdown download) lists every anomaly and the
   action taken.

## AI used

Built with **Claude Code** (Anthropic) as the development collaborator, directed and
reviewed line-by-line by me. `AI_USAGE.md` documents the workflow, key prompts, and
concrete cases where the AI's output was wrong and had to be caught and corrected.
