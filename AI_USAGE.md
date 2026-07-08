# AI_USAGE — Tools, Prompts, and Corrections

## Tools used

- **Claude Code** (Anthropic, Opus-class model) as the primary development collaborator:
  scaffolding, implementation drafts, and running verification commands under my direction.
- Every commit was reviewed before it was made; the phase plan, anomaly policies, and all
  product decisions in `DECISIONS.md` are mine.

## Workflow

1. I wrote a full build spec first (tech stack, data model, an anomaly catalog with a policy
   per problem, API surface, and a commit-by-commit roadmap) and had the AI follow it
   phase by phase.
2. Each phase ended with a verification step against the real backend/CSV **before** its
   commit: the split resolvers were tested with the actual CSV numbers, the detector stage
   was golden-tested against all 42 rows, and the whole import was exercised end-to-end
   (upload → approvals → commit → report → balance integrity) before the import commits
   went in.
3. Docs were written from notes kept during the build, not reconstructed afterwards.

## Key prompts (abridged)

- *"Prepare a complete spec that will guide development from start to finish, with
  feature-wise commits."* → produced the phase/commit roadmap the repo history follows.
- *"The importer must detect, surface, and handle every problem under a documented policy —
  a crashed import and a silent guess are both failing answers."* → the
  events-not-silent-fixes design in `importer/parsing.py` (every normalization emits an
  event that becomes a reported anomaly).
- *"Run the full CSV through the pipeline with the real roster and show me every anomaly
  with its rows"* → the golden test that validated all 18 detector types before commit.

## Cases where the AI was wrong, how I caught it, what changed

1. **Decimal crash on JSONB write.** The AI passed `Decimal` values into the `split_raw`
   JSON field; psycopg's JSON encoder raised `TypeError: Object of type Decimal is not JSON
   serializable` — but only when the importer (not the manual expense path) wrote the field.
   Caught by the end-to-end import run against Postgres before committing Phase 7. Fix:
   `expenses/services.py` stringifies split details before they reach any JSON column.

2. **`AUTH_USER_MODEL` referenced a model that didn't exist yet.** The AI's Phase-1 settings
   set `AUTH_USER_MODEL = "accounts.User"` while the custom user model was scheduled for
   Phase 2, which would have broken `manage.py check` on the very first commit. Caught by
   running `manage.py check` before committing. Fix: the setting moved into Phase 2
   alongside the model — order matters because swapping the user model after the first
   migration is a known Django trap.

3. **A masked build failure almost produced an unverified commit.** The AI chained
   `npm run build 2>&1 | tail && git commit …` from the wrong working directory; the pipe
   made the shell see `tail`'s exit code, so npm's failure didn't stop the commit. Caught
   because the npm error text was visible in the output. Fix: re-ran the build from
   `frontend/` and verified it passed; subsequent phases separated build verification from
   committing.

4. **Stock scaffold cruft committed as if it were project code.** The Vite template's
   `hero.png`, `vite.svg`, stock `README.md`, and an unused `icons.svg` landed in the
   Phase-8 commit. Against the rule that every file must have a reason to exist, the commit
   was amended after checking `index.html`/component references to confirm which assets
   were actually used (only `favicon.svg`).

5. **Overcomplicated, subtly wrong out-of-order detector.** The first draft of
   `_out_of_order` used a double comprehension with a shadowed loop variable
   (`for a_row in [a_row]`) — it happened to run but was unreadable and fragile. Replaced
   with a plain "a row is out of order if it is dated later than the row that follows it"
   comparison before the detector commit.
