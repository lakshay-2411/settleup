# AI_USAGE — Tools, Prompts, and Corrections

## Tools used

- **Claude Code** (Anthropic) as the primary development collaborator: scaffolding,
  implementation drafts, profiling, and running verification commands under my direction.
- Every commit was reviewed before it was made; the phase plan, anomaly policies, and all
  product decisions in `DECISIONS.md` are mine.

## Workflow

1. I wrote a full build spec first (tech stack, data model, an anomaly catalog with a
   policy per problem, API surface, and a commit-by-commit roadmap) and had the AI follow
   it phase by phase.
2. Each phase ended with verification against the real backend/CSV **before** its commit:
   split resolvers tested with the actual CSV numbers, detectors golden-tested against all
   42 rows, and the whole import exercised end-to-end (upload → approvals → commit →
   report → balance integrity) over both the ORM and plain HTTP.
3. The UI was iterated in review loops: the AI produced a version, I judged it on screen,
   and we rebuilt — three times — until the direction was right. Design alternatives were
   compared as rendered mockups before implementing the winner.
4. Docs were written from notes kept during the build, not reconstructed afterwards.

## Key prompts (abridged)

- *"Prepare a complete spec that will guide development from start to finish, with
  feature-wise commits."* → produced the phase/commit roadmap the repo history follows.
- *"The importer must detect, surface, and handle every problem under a documented policy —
  a crashed import and a silent guess are both failing answers."* → the
  events-not-silent-fixes design in `importer/parsing.py`.
- *"Can we take the person's details at that point only — will this cover the Meera case?"*
  → the two-phase review with post-decision re-analysis (D17).
- *"The commit API takes a lot of time — find all the reasons before changing code."* →
  the measured 173-queries × 190 ms diagnosis and the bulk-write fix (D19).

## Cases where the AI was wrong, how I caught it, what changed

1. **It shipped a mobile app UI for a laptop demo.** The first full redesign put the app
   in a phone-width column with a bottom dock — but the assignment demo runs on a laptop.
   Caught immediately on screen review. The AI redesigned desktop-first: top-bar
   navigation, multi-column layouts, wide hero. Design intent has to be stated *and*
   checked visually; the AI optimized for "app-like" literally.

2. **Per-row database writes made the import commit take 33 seconds.** The AI's original
   `commit_batch` called an atomic `create_expense()` per CSV row — 173 sequential
   queries, each paying a ~190 ms network round trip to Supabase, half of them pure
   SAVEPOINT bookkeeping from nested transactions. Caught by profiling with
   `CaptureQueriesContext` after I noticed the commit button hanging. Rewritten to three
   bulk inserts (18 queries, ~3 s), with both golden import runs re-verified identical.

3. **The two-phase flow silently lost the Meera anomaly on the empty-roster path.** The
   AI enabled importing into an empty group, but everyone became a guest whose window
   spanned their file appearances — so "Meera charged after moving out" could never fire,
   and the AI didn't flag the coverage loss until questioned. The fix (people step with
   real join/leave dates + re-running the window checks after those decisions) came out
   of me pushing on "why did the anomaly count drop?".

4. **Decimal crash on JSONB write.** The AI passed `Decimal` values into the `split_raw`
   JSON field; psycopg raised `TypeError: Object of type Decimal is not JSON serializable`
   — but only on the importer path, not the manual-expense path. Caught by the end-to-end
   import run against Postgres before the import commits landed. Fix: stringify split
   details before they reach any JSON column.

5. **A DRF default swallowed the report download.** `?format=md` returned 404 because
   Django REST Framework reserves the `format` query param for its own content
   negotiation. Caught during the HTTP end-to-end pass (200 without the param, 404 with
   it). Fix: `URL_FORMAT_OVERRIDE: None` — and the same endpoint later gained `?format=pdf`
   safely.

6. **The AI's own test harness tried to delete shared people by name.** Its E2E cleanup
   ran `Person.objects.filter(name__in=[...]).delete()`, which collided with real groups
   referencing the same Person rows — the FK `PROTECT` constraint blocked it exactly as
   designed. Caught by reading the "clean" run's output instead of trusting the exit code.
   The harness was fixed to delete only fully-orphaned persons; production data was never
   touched, which validated the PROTECT choice.
