# End-to-end tests

These drive the real application in a real browser against a real database,
worker and parser service. They exist because every bug found in this project
so far has lived in the wiring between components rather than inside one:

- BullMQ silently rejecting `:` in job ids, so deduplicated jobs vanished while
  the user's action still appeared to succeed
- Recharts 2.x rendering axes but no bars under React 19
- an RLS policy whose subquery was itself filtered by another policy, so the
  branch could never fire
- a confirmation message rendered inside a component that the same action
  unmounts
- an inner join onto a table the caller's policy does not admit, which returns
  nothing rather than erroring, so two whole features were dead
- two overlapping flush passes reporting a pending count that included work
  already on the wire, so submit refused a paper that was in fact fully saved

None of those were visible to a unit test. All were obvious within seconds of
watching the product run. Building this suite found five more; they are listed
in the root `README.md` under *What the end-to-end pass found*.

## Running them

The suite needs the whole system up:

```bash
service postgresql start
redis-server --daemonize yes
npm run db:push && npm run db:seed   # a known starting state
npm run worker &                     # background jobs
(cd services/parser && uvicorn app.main:app --port 8000 &)
npm run build && npm run start &     # or npm run dev

npm run test:e2e                     # or: npm run test:all
```

The seed runs automatically before every suite run (`global-setup.ts`): the
employer spec begins from a *pending* access request and ends with a revoked
one, so a second run against the leftovers of the first would assert against the
wrong state. Set `E2E_SKIP_SEED=1` to manage the database yourself.

## Layout

| File | Covers |
|---|---|
| `01-student-journey.spec.ts` | One student, one session: signup and consent, diagnostic, gap report, mock interview and async evaluation, resume and JD matching, readiness, data request, verification link issue and revoke |
| `02-tpo-journey.spec.ts` | Cohort insights, filters, sortable students table, CSV export, curriculum benchmark, outcome capture with company withheld, readiness weights, validation evidence, data requests |
| `03-employer-journey.spec.ts` | Employer signup, the two-key access model end to end: nothing → grant → anonymised counts → student opt-in → named profile → withdrawal → revocation |
| `04-security.spec.ts` | Unauthenticated access to every protected route, cross-tenant and peer report access by URL, role boundaries, CSV leakage, malformed verification tokens |
| `05-roster-journey.spec.ts` | Bulk roster onboarding: CSV preview with per-row outcomes, import, join links issued once, student redemption with their own password and consent, re-import idempotence, reissue and revoke, cross-tenant and role isolation |
| `06-item-quality.spec.ts` | The item-quality report: reachable by the platform owner, invisible and unreachable to a TPO, a student, an employer and a stranger; says plainly when no analysis has been run |
| `07-assessment-resilience.spec.ts` | The network cut mid-paper: the offline indicator, the answer held on the device, a submit that refuses to lose unsent work, recovery after a reload, and automatic flush when saving works again |
| `08-faculty-journey.spec.ts` | The lecturer's view: their own subjects and sections, topics named against each area, gaps scoped to what they teach, and the placement-office pages they can neither see nor reach |
| `09-practice-loop.spec.ts` | Gap → practice → re-prove: acting on a gap from the report, practice withholding its answer until committed then explaining it, a check that reveals nothing as you go, the cooldown, and the refusal to call a small move an improvement |

## Conventions

**One page per journey.** Playwright gives each test a fresh context, which
would drop the session between steps. The journey specs share a single page via
`beforeAll`, because they are deliberately one continuous session — the way a
real person experiences the product. Tests that must not disturb that session
(a failed signup, an outsider probing a URL) open their own context.

**Wait for the app, not the clock.** Autosave is debounced and evaluation,
parsing and matching run in a worker, so the UI shows a pending state first.
`pollUntil` reloads until the condition holds rather than sleeping a guessed
interval. Racing the debounce produces a mostly-blank paper, which looks like a
scoring bug and is not one.

**Assert on what the product promises, not just that it renders.** Several
assertions check that a caveat is present — that benchmarks are labelled
provisional, that a resume gap means missing words rather than a missing skill,
that validation evidence refuses to claim a relationship it cannot support.
Those sentences are product decisions, and a silent removal should fail a test.

**Test hooks over class names.** Where a value has no accessible name, the
component carries a `data-testid`. Asserting on Tailwind classes couples the
suite to styling and breaks on a restyle that changed nothing.
