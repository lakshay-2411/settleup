# SettleUp — Shared Expenses App

A shared-expenses web app for a flat whose membership changes over time. Tracks group
expenses across multiple currencies, computes who-owes-whom balances with full drill-down,
records settlements, and imports a messy spreadsheet export through an anomaly-detecting
import pipeline with user approval for every destructive change.

> Full documentation is being written alongside the build:
> - Setup & run instructions — below (completed at the end of the build)
> - `SCOPE.md` — anomaly log + database schema
> - `DECISIONS.md` — decision log
> - `AI_USAGE.md` — AI tooling notes

## Stack

- **Frontend:** React + TypeScript (Vite), Tailwind CSS, TanStack Query, React Router
- **Backend:** Python, Django + Django REST Framework, JWT auth
- **Database:** PostgreSQL (Supabase in production)

## Repository layout

```
backend/    Django project — accounts, groups, expenses, ledger, importer
frontend/   React + TypeScript app
```

## Setup

_To be completed at the end of the build (Phase 10)._

## Deployed app

_URL placeholder — filled in after deployment._
