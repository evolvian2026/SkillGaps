# SkillGaps — Phases 1–3

Skill-gap diagnostics for Indian engineering students, with cohort-level
visibility for university Training & Placement Officers.

**Phase 1** — auth and tenancy, the diagnostic assessment engine, the individual
gap report, the read-only institution dashboard, and DPDP-aligned consent and
data-request handling.

**Phase 2** — mock interview simulator with pluggable evaluation, resume vs.
job-description matching, curriculum benchmarking, a placement readiness score,
and placement outcome capture. Adds a background job queue and a separate
Python parsing service.

**Phase 3** — employer portal with anonymised candidate pools and custom
campus-drive assessments, student-controlled profile sharing, verifiable skill
profiles with revocable links, outcome-driven benchmark calibration, and
validation reporting.

---

## Quick start

```bash
# 1. PostgreSQL roles. The app role must NOT have BYPASSRLS — that, plus
#    FORCE ROW LEVEL SECURITY, is what makes tenant isolation real.
psql -c "CREATE ROLE skillgaps_owner LOGIN PASSWORD 'change-me' BYPASSRLS;"
psql -c "CREATE ROLE skillgaps_app   LOGIN PASSWORD 'change-me' NOBYPASSRLS;"
psql -c "CREATE DATABASE skillgaps OWNER skillgaps_owner;"
psql -d skillgaps -c "REVOKE ALL ON SCHEMA public FROM PUBLIC;
                      GRANT USAGE ON SCHEMA public TO skillgaps_app;"

# 2. Config
cp .env.example .env.local   # then edit DATABASE_URL / MIGRATION_DATABASE_URL

# 3. Schema, RLS policies, and seed data
npm install
npm run db:push      # migrations + drizzle/sql/*.sql (RLS)
npm run db:seed      # taxonomy, question bank, benchmarks, 2 demo universities

# 4. Run — three processes
npm run dev        # the web app
npm run worker     # background jobs (needs Redis)
npm run py:dev     # the Python parser service (see services/parser/README.md)
```

Redis and the parser service are optional for Phase 1 features. Without them,
Phase 2 uploads and evaluations queue but never complete, and the UI says so
rather than failing silently.

### Demo logins

Password for every seeded account: `SkillGaps2026`

| Role | Email |
|---|---|
| TPO / admin | `tpo@sunrise.edu.in` |
| TPO / admin | `tpo@meridian.ac.in` |
| Platform owner | `root@sunrise.edu.in` — super-admin; the only role that can open `/admin/items` |
| Faculty | `faculty@sunrise.edu.in` — teaches two seeded subjects to CSE section A |
| Employer | `recruiter@northwind.example` — starts with a **pending** access request, so approving it is part of the demo |
| Student | any seeded student address — `psql -d skillgaps -c "SELECT email FROM users WHERE role='student' LIMIT 5"` |

New students can self-register at `/signup`. A `@sunrise.edu.in` or
`@meridian.ac.in` address joins that university automatically; anyone else needs
the invite code `SUNRISE26` or `MERIDIAN26`.

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:push` | Apply migrations **and** the hand-written RLS SQL |
| `npm run db:seed` | Reset and reseed taxonomy, questions, demo tenants |
| `npm run db:reset` | Drop and recreate the schema (development only) |
| `npm run db:generate` | Regenerate a migration after editing the schema |
| `npm run worker` | Background job worker (BullMQ + Redis) |
| `npm run py:dev` | Python parser service on :8000 |
| `python services/parser/calibrate.py --all` | Offline benchmark calibration (add `--publish` to apply) |
| `npm test` | Vitest — scoring, RLS isolation, full assessment flow |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |

`npm test` needs a migrated, seeded database; it creates and removes its own
tenants.

---

## Tenant isolation

This is the part universities ask about during procurement, so it is enforced in
PostgreSQL rather than only in application queries.

- Every tenant-scoped table has `ENABLE` **and** `FORCE ROW LEVEL SECURITY`.
- The application connects as `skillgaps_app`, which has **no** `BYPASSRLS`.
  Migrations and seeds use a separate owner role and are the only thing that can
  write across tenants.
- Identity reaches Postgres as three transaction-local GUCs — `app.user_id`,
  `app.tenant_id`, `app.user_role` — set by `withRequestContext()` in
  `src/lib/db/client.ts`. `set_config(..., true)` scopes them to the
  transaction, so a pooled connection never carries the previous request's
  tenant.
- Policies are written against `app.current_user_id()`,
  `app.current_tenant_id()`, `app.current_role()` and `app.is_staff()`.

The consequence: a query that forgets its `WHERE tenant_id = ...` returns only
the caller's rows, and a staff user cannot write to student attempt data at all
— the dashboard is read-only in the database, not just in the UI.
`tests/rls.test.ts` asserts all of this against a real database.

**Porting to Supabase:** replace only the three function bodies at the top of
`drizzle/sql/0001_rls.sql` to read from `auth.jwt()` instead of
`current_setting(...)`. Every policy is expressed in terms of those functions,
so no policy changes.

---

## Database schema

### Tenancy and identity
| Table | Notes |
|---|---|
| `tenants` | University. `email_domains[]` and `invite_code` drive signup routing. |
| `users` | `role`: student / faculty / admin / employer / super_admin. Employer is declared now so Phase 3 extends this model rather than building a parallel one. |
| `student_profiles` | Branch, section, batch year, roll number — what the dashboard filters on. |
| `sessions` | Server-side sessions for `AUTH_PROVIDER=local`. Stores a SHA-256 of the cookie token, never the token. |
| `practice_sessions`, `practice_responses` | Untimed practice on one skill area, drawn from the practice pool only. Feeds no score anywhere. |
| `skill_checks`, `skill_check_questions` | Short scored re-checks. Deliberately not `attempts` rows — the cohort dashboard, employer pools and item analysis all read `attempts`, and a focused check is not comparable to a full paper. |
| `teaching_assignments` | Who teaches which subject to which section. Written by the placement office only — a lecturer who could write here could read any section in the institution. |
| `roster_invitations` | A bulk import creates these, not accounts — consent has to be the student's own act. Unique on (tenant, email) so a re-import updates rather than duplicates. Stores a SHA-256 of the join token, never the token. |

### Shared taxonomy (global, not tenant-scoped)
| Table | Notes |
|---|---|
| `skill_areas` | DSA, SQL, Python for Data, Statistics, ML, System Design, CS Core, Aptitude, Programming. |
| `tracks` | SDE, Data Analyst, ML Engineer. Duration and fast-completion threshold are per track. |
| `track_blueprint_items` | How many questions to draw from each skill area, and its weight. Adding a track is data, not code. |
| `questions` | MCQ, short answer or code. Tagged to one skill area, difficulty 1–3. |
| `question_tracks` | A question can serve several tracks. |
| `question_options`, `question_test_cases` | Answer key and Judge0 test cases. |
| `benchmark_sets`, `benchmark_thresholds` | Versioned hiring bars. Sets are versioned rather than edited in place so every report can name the thresholds it was scored against. |
| `resources` | Manually curated free resources per skill area. |

### Attempts and scoring (tenant-scoped)
| Table | Notes |
|---|---|
| `attempts` | Server-authoritative `expires_at`; `benchmark_set_id` records which calibration was used; `integrity_flags` holds the rolled-up review summary. |
| `attempt_questions` | The frozen, randomised paper — selection, order, and per-attempt option order. A reload cannot reshuffle into an easier set. |
| `answers` | One row per question. Raw response always retained; `execution_result` holds the Judge0 run. |
| `attempt_skill_scores` | Per-area score, plus a copy of the hiring bar at scoring time so reports stay stable across recalibration. |
| `integrity_events` | Raw signals: tab blur, blocked paste/copy, and so on. |

### Privacy
| Table | Notes |
|---|---|
| `consent_records` | Append-only. No UPDATE/DELETE grant exists, so withdrawal is a new row and the notice text shown at the time is stored verbatim. |
| `data_requests` | Student-raised export/erasure requests, resolved by staff. |

### Phase 2: mock interviews
| Table | Notes |
|---|---|
| `interview_questions` | Shared bank: behavioural, technical, situational. Technical questions are tagged to the same `skill_areas` as the diagnostic, so both sit on one axis. |
| `interview_question_tracks` | A question can serve several tracks. |
| `interview_sessions` | One sitting. Records which evaluation method produced the score. |
| `interview_responses` | Per-question answer, score, criterion breakdown, strengths and improvements. |

### Phase 2: evaluation audit
| Table | Notes |
|---|---|
| `ai_evaluations` | Every evaluation's verbatim input and output, whatever the method. Append-only through the app role, so a score can be traced and re-run but never quietly rewritten. |

### Phase 2: resume matching
| Table | Notes |
|---|---|
| `resumes` | Metadata and extracted text. The file itself lives in object storage. `retain_until` drives the automatic purge. |
| `job_descriptions` | Student-pasted or staff-published to a whole cohort. |
| `resume_matches` | Coverage score, matched keywords, and the gaps. |

### Phase 3: employers, sharing, verification, calibration
| Table | Notes |
|---|---|
| `employers` | Employer organisation. Separate from `tenants` because an employer owns no students — conflating them makes it far too easy to write a policy that treats one like a data owner. Carries its own `tenants` row so employer users satisfy the identity model with no special-casing. |
| `employer_access_grants` | The whole of an employer's reach. Requested by the employer, decided by the university. |
| `profile_share_consents` | Append-only student opt-in per employer: who, what scope, when, and the verbatim notice shown. |
| `employer_assessments` | Campus drives, drawing from the Phase 1 question bank and scoped to granted cohorts. |
| `employer_assessment_attempts` | Links a drive to the ordinary `attempts` row it produced, so results flow through the same scoring path. |
| `verified_profiles` | Frozen snapshot plus the SHA-256 of a shareable token. Revocable, optionally expiring, view-counted. |
| `item_analysis_runs`, `item_statistics` | Question bank health, global rather than tenant-scoped: an item's statistics only mean anything pooled across institutions. Readable by `super_admin` alone. |
| `calibration_runs` | Every calibration attempt, including the ones that declined to change anything. |

### Phase 2: curriculum, readiness, outcomes
| Table | Notes |
|---|---|
| `industry_skill_references` | The in-demand skill list per area, with aliases and a demand weight. `source` distinguishes curated entries from scraped ones. |
| `syllabus_subjects` | The institution's own syllabus topics. Staff-only — not student-facing. |
| `readiness_weights` | Per-tenant component weighting. |
| `readiness_scores` | Materialised composite, with the weights used and how many components fed it. |
| `placement_outcomes` | Placed/not placed, role, optional and anonymisable company, coarse package band. |

---

## API surface

Most reads are React Server Components with no API route. Mutations are Server
Actions. Only the CSV export needs a real endpoint.

### Server Actions
| Action | Module | Notes |
|---|---|---|
| `signupAction`, `loginAction`, `logoutAction` | `lib/auth/actions.ts` | Signup resolves a tenant by invite code or email domain and writes a consent record. |
| `startAttemptAction` | `lib/assessment/actions.ts` | Returns the existing in-progress attempt rather than starting a second. |
| `saveAnswerAction` | `lib/assessment/actions.ts` | Saves one answer. Deliberately does not grade — nothing about correctness is observable mid-attempt. |
| `recordIntegrityEventAction` | `lib/assessment/actions.ts` | Records a signal. Never blocks. |
| `submitAttemptAction` | `lib/assessment/actions.ts` | Grades and finalises. Idempotent. |
| `createDataRequestAction`, `withdrawConsentAction` | `lib/privacy/actions.ts` | Student-side DPDP flows. |
| `resolveDataRequestAction` | `lib/privacy/actions.ts` | Staff-side resolution. |
| `startInterviewAction`, `saveInterviewResponseAction`, `submitInterviewAction` | `lib/interview/actions.ts` | Mock interview. Submission queues evaluation rather than blocking the request. |
| `uploadResumeAction`, `createJobDescriptionAction`, `requestMatchAction` | `lib/matching/actions.ts` | Upload goes to object storage; parsing and matching are queued. |
| `saveSubjectAction`, `deleteSubjectAction` | `lib/curriculum/actions.ts` | Syllabus entry, staff only. |
| `saveReadinessWeightsAction` | `lib/readiness/actions.ts` | Sets per-tenant weights and requeues every student's score. |
| `saveOutcomeAction` | `lib/readiness/actions.ts` | Placement outcome, by the student or their TPO. |
| `requestAccessAction`, `decideAccessAction` | `lib/employer/actions.ts` | Employer requests; university decides. |
| `setProfileShareAction` | `lib/employer/actions.ts` | Student opt-in/withdrawal, recorded as an event. |
| `createAssessmentAction`, `startEmployerAssessmentAction` | `lib/employer/actions.ts` | Campus drives, reusing the Phase 1 attempt engine. |
| `issueProfileAction`, `revokeProfileAction` | `lib/verification/actions.ts` | Verification links. |
| `employerSignupAction` | `lib/auth/actions.ts` | Employer registration; role is fixed in SQL. |

### Routes
| Route | Who | Purpose |
|---|---|---|
| `/` | anyone | Landing |
| `/signup`, `/login` | anonymous | Auth |
| `/privacy` | anyone | Data-handling notice |
| `/dashboard` | student | Tracks, attempt history, resume in-progress |
| `/assess/[attemptId]` | student | The assessment runner |
| `/report/[attemptId]` | student + own-tenant staff | Gap report |
| `/account` | any signed-in | Consent record, export/delete requests |
| `/admin` | staff | Cohort insights, heatmap, filters |
| `/admin/students` | staff | Sortable student table |
| `/admin/requests` | staff | Data-request queue |
| `/interview` | student | Mock interview index and history |
| `/interview/[sessionId]` | student | The interview runner |
| `/interview/[sessionId]/feedback` | student + own-tenant staff | Per-question feedback |
| `/resume` | student | Upload, add a JD, run a match |
| `/resume/[matchId]` | student + own-tenant staff | Match report |
| `/admin/curriculum` | staff | Syllabus vs. in-demand skills |
| `/admin/settings` | staff | Readiness component weighting |
| `/admin/outcomes` | staff | Placement outcome capture |
| `/admin/employers` | staff | Approve or revoke employer access |
| `/admin/validation` | staff | Validation evidence and calibration history |
| `/account/sharing` | student | Choose which employers may see them |
| `/account/profile` | student | Issue and revoke verification links |
| `/employer` | employer | Overview |
| `/employer/candidates` | employer | Anonymised pool and shared profiles |
| `/employer/assessments` | employer | Create and manage campus drives |
| `/employer/access` | employer | Request institution access |
| `/employer-signup` | anonymous | Employer registration by email domain |
| `/verify/[token]` | anyone with the link | Public verified profile |
| `GET /api/admin/export` | staff | CSV of the filtered cohort |

### Background jobs

Nothing slow or failure-prone runs in a request handler. Jobs are BullMQ on
Redis, processed by `npm run worker`.

| Job | Triggered by | Does |
|---|---|---|
| `evaluate-interview` | Interview submission | Scores every response through the evaluation adapter, writes audit rows, recomputes readiness |
| `parse-resume` | Resume upload | Fetches from storage, calls the parser service, stores text and skills |
| `extract-jd-keywords` | JD creation | Calls the parser service for weighted keywords |
| `match-resume` | Match request | Computes coverage once both sides are parsed, recomputes readiness |
| `recompute-readiness` | Weight change, diagnostic submission | Recomputes one student's composite |
| `purge-expired-resumes` | Worker startup, then every 6h | Deletes resumes past their retention deadline |

Each job runs under the **RLS context of the student it acts for** (see
`src/worker/context.ts`), so a job cannot reach data that student could not.
The worker holds no elevated database privileges.

---

## Assessment integrity

Built in from the first assessment feature, as review signals rather than
blocks — a student on a flaky hostel connection looks identical to one switching
tabs, and treating that as cheating would be both wrong and unfair.

- Question **selection** is randomised per attempt and spread across difficulty
  levels, so scores stay comparable between students. Randomisation is only real
  if the pool is deeper than the quota — when they are equal, every student sits
  an identical section and a retake asks the same questions. Every blueprint
  quota now has at least 2.5x depth, and `tests/question-bank.test.ts` fails if
  a future quota or bank change erodes that.
- Question **order** and MCQ **option order** are randomised per attempt, so a
  shared answer key ("it's the third one") does not transfer.
- The paper is frozen at `attempt_questions` on creation.
- The deadline is server-authoritative. The countdown is display only, and a
  student returning after expiry is graded, not given extra time.
- Copy and paste are blocked on code questions, and each blocked attempt is
  recorded.
- Tab switches are recorded; an unusually fast completion is flagged against the
  track's own `fast_completion_ratio`.
- The answer key never reaches the client mid-attempt — `loadPaper()` builds the
  student-facing shape, and a test asserts the payload contains no
  `is_correct`, `expectedStdout` or `explanation`.

---

## Testing

| Suite | Command | What it proves |
|---|---|---|
| Unit + RLS | `npm test` | Scoring, matching, curriculum comparison, evaluation, calibration guards, and tenant isolation on every table, against a real database |
| Python | `cd services/parser && pytest` | Text extraction, skill matching, and the calibration and item-analysis statistics including every refusal path |
| End-to-end | `npm run test:e2e` | The whole product in a browser: nine journeys plus security probes. See `e2e/README.md` |
| Everything | `npm run test:all` | Unit then end-to-end |

The end-to-end suite needs the full system running — database, Redis, worker,
parser service and the app. It exists because every bug found in this project
so far has lived in the wiring between components rather than inside one, and
none of them were visible to a unit test.

The suite reseeds before every run (`e2e/global-setup.ts`), because the
employer journey starts from a *pending* access request and ends with a revoked
one. Set `E2E_SKIP_SEED=1` to run it against a database you are preparing
yourself.

### What the end-to-end pass found

Adding it was not a formality. Five real defects were only visible once the
pieces ran together, all now fixed with a regression test each:

| Symptom | Cause |
|---|---|
| A TPO resolved a data request and got no confirmation | Resolving moved the row from the open list to the closed one, unmounting the form the message would have rendered in. Fixed by redirecting to a page-level confirmation. |
| A TPO granted an employer access and got no confirmation | The same defect on a different page — the row moves between the pending and decided lists. |
| `ERR_TOO_MANY_REDIRECTS` for a wrong-role visitor | Each guard redirected to its own area's home, so an employer hitting `/dashboard` bounced to `/admin`, back to `/dashboard`, until the browser gave up. `homeFor()` in `src/lib/auth/routing.ts` now gives one answer per role, and `tests/auth-routing.test.ts` proves no role is sent to a page that would redirect it again. |
| Employer signup crashed | Signup read back the new user row to find its tenant, with no identity set yet — so RLS returned nothing. The `SECURITY DEFINER` signup function now returns the tenant. |
| An employer could see no institution, and no student who had opted in to share with them | Three queries inner-joined `tenants`, which an employer's policy does not admit: their own tenant is the organisation record, not a university. The join silently dropped every row, leaving three pages permanently empty with no error anywhere. Names now come from `app.employer_grants()` and `app.institution_directory()`, which return an id and a name and never an invite code. |

The last one is the instructive one. RLS policies compose: a join is filtered by
the policy on *every* table in it, so a correct policy on one table plus no read
access to another silently yields nothing rather than an error. Two of the five
were features that had never worked at all.

## Bulk roster onboarding

A placement office with 1,200 students needs to get them onto the platform
without asking each one to find the signup page. `/admin/roster` takes the CSV
their office already exports.

**An import creates invitations, never accounts.** That is the whole design,
and it follows from a constraint already enforced in the database: consent must
be the student's own act, and `consent_records` refuses a write by anyone but
the subject. An import that minted live accounts would therefore produce users
carrying no consent record at all — the exact DPDP hole the rest of the product
is built to avoid. So the institution supplies what it is authoritative for
(roll number, branch, section, batch year) and the student supplies what only
they can (a password, and consent) when they redeem their link.

| Step | What happens |
|---|---|
| Upload or paste | Headers are matched against common spellings — `Roll No.`, `Registration Number`, `Dept`, `Div`, `Year of Passing` all resolve. Unknown columns are ignored, not rejected. |
| Preview | Every row is classified — invite, update, reissue, or skip — with a per-row reason, and bad rows are reported by line number. Nothing is written yet. |
| Import | Invitations are written and join links returned **once**. |
| Redeem | The student opens `/join/<token>`, sees the details their college supplied, sets a password and gives consent. |

Details worth knowing:

- **Re-importing is safe.** Rows are keyed on (institution, email), so a second
  import of a corrected file updates rows rather than duplicating them, and a
  student who has already joined is left alone. A row that keeps its existing
  invitation keeps its link, so fixing one student's branch does not break the
  1,199 links already emailed.
- **Links are shown once and cannot be recovered.** Only the SHA-256 reaches
  the database, so a dump yields nothing usable — and for the same reason we
  cannot redisplay one. Reissuing mints a fresh link and invalidates the old,
  which the UI says before the button is pressed.
- **A join link is single-use**, enforced by the `UPDATE ... WHERE status =
  'pending'` inside `app.redeem_roster_invitation`, so two simultaneous
  redemptions serialise on the row and the loser raises.
- **Unknown, expired and revoked tokens are indistinguishable** to the caller —
  a guessed token reveals nothing about whether it ever existed.
- **Students cannot read the roster**, including their own institution's: it is
  a directory of every classmate's name and email address. Only staff have a
  policy on that table.
- **The platform sends no email.** The TPO downloads a CSV of links and sends
  it however they already reach students. Wiring an email provider is a
  configuration change, not a redesign.
- Invitations expire after 30 days. "Expired" is derived from `expires_at`
  rather than stored, so no sweep job is needed to keep the table honest.

`tests/rls-roster.test.ts` asserts the isolation and single-use properties
against a real database; `tests/roster-csv.test.ts` covers the messy-file
behaviour; `e2e/05-roster-journey.spec.ts` drives the whole flow in a browser.

## The gap → practice → re-prove loop

The product diagnosed a gap, listed some curated resources, and then had
nothing to offer but "retake the whole paper". A diagnostic that does not drive
improvement is a report card. Every gap on a report now carries two ways out:

| | Practice | Skill check |
|---|---|---|
| Question pool | **Practice only** — separate content | Diagnostic items in that one area |
| Feedback | Answer and explanation, immediately | Nothing until you submit |
| Scored into | Nothing at all | Nothing at all — a personal signal |
| Length | 6 questions | Up to 8, at least 5 |
| Repeatable | Freely | Once per area per 12 hours |

### The rule the whole thing rests on

**A practice item is never a diagnostic item.** Practice shows the correct
answer and an explanation the moment a student commits; if the same question
could appear on a diagnostic, practice would be an answer key, and every
diagnostic score, cohort average, employer pool and item statistic in the
product would be worthless.

`questions.pool` separates them permanently, and a database trigger refuses to
attach a practice question to a track — which is the one link through which a
practice item could otherwise reach a graded paper. It refuses the owner role
too, so a future seed or admin tool cannot quietly reintroduce the leak.

### Why a check will often say "I can't tell"

A check is a handful of binary questions, so one lucky guess is worth twelve to
twenty points. Telling a student they improved on that evidence would be the
most believable lie this product could tell.

So the margin required to claim a change is derived from the check's actual
length — roughly two standard errors, `100/√n`:

| Check length | Move needed to claim a change |
|---|---|
| 5 questions | 45 points |
| 8 questions | 35 points |
| 12 questions | 29 points |

Below that it says the check is too short to tell the move apart from luck, and
names the measurement rather than the student as the limit. A check also never
feeds the readiness score, the cohort figures, the employer pools or the item
analysis — the full diagnostic remains the only thing that counts, and the UI
says so on every screen.

The cooldown is the other half of that honesty: without it a student can
re-check until a lucky run, which measures the question bank's exposure rather
than their own progress.

### What the seeded bank can and cannot serve

**98 practice items across 9 skill areas** — 10 to 12 each, spread over all
three difficulty levels — and 6–18 diagnostic multiple-choice items per area.
That is enough for practice everywhere, with room for a student to practise an
area repeatedly before repeating a question, and enough for a skill check in
every area.

The draw prefers questions the student has not seen in that area and spreads
them across difficulty, falling back to already-seen items only once the area
runs dry — which is a signal to grow the bank, not a reason to fail.

The report still offers each button **only where the bank can serve it**, and
says so plainly where it cannot — a button that can only fail is worse than no
button, and a shrinking bank would bring that case back.
Item analysis (`/admin/items`) is how you tell which items are worth keeping as
the bank grows.

`tests/practice-bank.test.ts` and `tests/question-bank.test.ts` guard the
content itself: exactly one correct option per item, at least three options, no
duplicate prompts, an explanation on every practice question, accepted answers
on every short-answer item and test cases on every code item — plus the
blueprint-depth and skill-check-floor invariants above, and a check that **no
prompt appears in both pools**, since a shared prompt would hand a student the
key to a question they are later graded on.

Hand-authored content at this volume is exactly where a slip hides. In practice
a wrong key teaches a student something false; in a diagnostic it silently
corrupts their report, their cohort's averages, the employer pools and the item
statistics, with nothing on any screen to reveal it.

`tests/practice-progress.test.ts` covers the claim rules, `tests/rls-practice.test.ts`
proves the pool separation and per-student privacy against a real database, and
`e2e/09-practice-loop.spec.ts` walks the loop in a browser.

## The faculty view

`faculty` was a staff role with no teaching attached, so a lecturer signed in
and got the placement office's dashboard: cohort-wide, placement-shaped, and
silent about the subject they actually teach. They could also approve an
employer's access, resolve a DPDP data request, and export every student's
placement status — none of which is teaching, and none of which is a
lecturer's to decide.

`/faculty` is now their home. For each subject they teach, it answers the
question a syllabus can act on: **of the things I teach, which is this class
weakest at, and what does my syllabus not cover?**

| What it shows | Why |
|---|---|
| Skill areas *this subject* teaches, weakest first | Mapped from the subject's own topic list, so a DBMS lecturer is never handed responsibility for another area |
| The lecturer's own topics against each area | A skill area code alone does not tell them which lecture to change |
| In-demand topics the syllabus misses | Only inside areas the subject already teaches — the rest would bury what they can act on |
| Syllabus topics the reference list does not recognise | Framed as a gap in the benchmark, not a fault in the teaching |

Three things it deliberately refuses to do:

- **It never names a student.** A class-level pattern is what a syllabus can
  answer; a name is the placement office's to act on. This is narrower than the
  TPO's view on purpose.
- **It will not read a pattern from a handful of students.** Below eight
  assessed it says so and stops, rather than presenting noise as a finding.
- **It does not invent a threshold.** Where a class spans tracks that set
  different hiring bars there is nothing to be "below", so it reports the
  average and says why. Every bar it does compare against is labelled
  provisional, like everywhere else.

### Teaching assignments, and why the lecturer cannot write them

A lecturer sees a class because the **placement office** said they teach it
(`/admin/teaching`). If faculty could write `teaching_assignments` they could
assign themselves any section in the institution and read its results, which
would turn the whole feature into a self-service tenancy hole. So writes are
`admin`/`super_admin` only, enforced twice — by `requirePlacementStaff` in the
action and independently by the RLS policy, which additionally refuses an
assignment naming a lecturer or a subject from another institution.

### What faculty kept, and what they lost

| Page | Faculty |
|---|---|
| `/faculty`, `/admin`, `/admin/students`, `/admin/curriculum`, `/admin/validation` | Kept — their students' learning |
| `/admin/teaching`, `/admin/roster`, `/admin/outcomes`, `/admin/employers`, `/admin/requests`, `/admin/settings`, the cohort CSV export | Placement office only |

This narrowing goes slightly beyond "add a faculty page", and it is deliberate:
adding a focused view while leaving a lecturer able to grant employers access to
the cohort would not have fixed the problem.

`tests/rls-teaching.test.ts` proves the database refuses a lecturer writing an
assignment; `e2e/08-faculty-journey.spec.ts` proves the application never
offers it.

## Employers: what a grant does and does not buy

Employers are the first role that reads across tenants, so the model is
deliberately two-key. **Neither key alone opens anything.**

| | University grant | Student opt-in | What the employer sees |
|---|---|---|---|
| Neither | ✗ | ✗ | Nothing at all |
| Grant only | ✓ | ✗ | Anonymised counts by skill area and band. No names. |
| Opt-in only | ✗ | ✓ | Nothing — the grant has lapsed or never existed |
| Both | ✓ | ✓ | That one student's name, scores and readiness |

- An employer can **request** access but never approve it: their INSERT policy
  constrains `status` to `pending`, and they hold no UPDATE policy on grants.
- A revoked or expired grant behaves exactly like one that never existed.
  Withdrawal of a student's consent takes effect on the next query.
- Neither staff nor the employer can write a consent record on a student's
  behalf. Only the student has an INSERT path.
- **Resumes are never visible to employers**, opt-in or not. A student sends a
  CV to an employer directly; holding one does not make us that channel.
- The anonymised pool does **not** go through the row policies at all. It is a
  SECURITY DEFINER function that returns only aggregates and suppresses buckets
  below five students, so the employer role holds no row access to
  non-consenting students. Serving the pool through widened row policies would
  have made the opt-in cosmetic.

`tests/rls-phase3.test.ts` asserts each row of that table against a real
database.

## Verified skill profiles

A student can issue a shareable link to a frozen snapshot of their results.

- The token is 32 random bytes; only its SHA-256 is stored, so a database dump
  yields no working links.
- The snapshot is frozen at issue time — an employer checking a link weeks
  later sees what was actually claimed, not a moving target.
- Each link is a separate secret with its own revocation, so withdrawing one
  employer's access never cuts off another's.
- Revoked, expired and unknown tokens all return one indistinguishable 404:
  telling them apart would confirm a link once existed.
- The public page carries the provisional-benchmark caveat and states plainly
  that no score on it is a hiring recommendation.
- The page is `noindex` — a verification link is a credential, not content.

## Item analysis: is the question bank any good?

Every number this platform reports — a gap report, a readiness score, an
employer's anonymised pool — rests on the questions underneath it. Nothing was
watching those. `services/parser/analyse_items.py` runs the same statistics the
calibration job already uses, pointed one level down: instead of asking whether
a skill-area score predicts placement, it asks whether an individual question
predicts the rest of the paper.

```bash
cd services/parser
python analyse_items.py              # the whole bank
python analyse_items.py --track SDE  # one track
python analyse_items.py --json       # report only, writes nothing
```

Results appear at `/admin/items`, **for `super_admin` only**.

| Statistic | What it says |
|---|---|
| **Facility** | Proportion answering correctly. Confusingly but conventionally, a *high* value means an *easy* item. |
| **Discrimination** | Point-biserial correlation between getting this item right and scoring well on the **rest** of the paper. The load-bearing number. |
| **Distractor breakdown** | Per option: how often it was chosen, and the mean rest-of-paper score of the students who chose it. |

Four decisions worth knowing:

- **It refuses below 30 responses**, and marks anything under 100 as
  provisional. A discrimination computed from a handful of responses is noise
  wearing the costume of a statistic — the same posture the calibration job
  takes on thin cohorts.
- **The correlation is corrected.** Each item is scored against the paper *with
  that item removed*. Correlating an item against a total that contains it
  inflates the coefficient badly on a short paper, which is exactly the shape
  of paper this product uses.
- **A meaningfully negative discrimination is reported as a fault, not a small
  positive.** An item the stronger students get wrong more often is almost
  always miskeyed. But a coefficient of −0.03 is noise: only values past −0.10
  are called out, because flagging every near-zero item as "probably miskeyed"
  would bury the handful that genuinely are.
- **The pool excludes papers flagged for fast completion**, and papers that
  were never submitted. Near-random responding depresses the measured
  discrimination of every item on the paper.

### Why `super_admin` and not the TPO

The question bank is global; an item's statistics only mean anything pooled
across every institution that has answered it. That makes these rows
cross-tenant by construction. A placement office reading them would be seeing
other colleges' response behaviour, about a bank they neither own nor can edit
— and "question 14 is miskeyed" is not something they can act on, only
something that would undermine the scores they are presenting to students. The
RLS policies on `item_analysis_runs` and `item_statistics` admit `super_admin`
alone, and `app.item_response_pool` is not granted to the application role at
all: only the offline job, running as the owner, may call it.

### A limitation worth stating

Classical item analysis assumes the rest of the paper is a reasonable measure
of ability. On a very short paper that assumption is fragile: verifying this
against a synthetic four-item paper, a single miskeyed item corrupted the
rest-of-paper score badly enough to drag a well-behaved neighbour to a negative
discrimination. At a realistic 18-item length the same fixture produced exactly
one urgent item — the miskeyed one — and left the good item clean. Read
per-item verdicts on a short paper with that in mind, and fix the urgent items
first, since they distort everything measured alongside them.

## Outcome-driven calibration

`services/parser/calibrate.py` correlates diagnostic scores against recorded
placement outcomes and can publish a calibrated benchmark set. It runs offline,
never in the request path.

**It is built to refuse.** A benchmark's whole value is that it was earned by
data, so the job produces `insufficient_data` rather than a number when:

- fewer than 30 students have both a score and a recorded outcome;
- fewer than 8 fall in either the placed or the unplaced group;
- the correlation is not significant at p < 0.05;
- the correlation is *negative*, which is a data-quality signal rather than a
  bar to publish upside down.

Runs that refuse are still recorded in `calibration_runs` — "we looked, and
there was not enough evidence" is exactly the record that justifies why the
live benchmarks are still marked provisional. Students whose outcome is "not
yet known" are excluded rather than counted as unplaced, which would bias every
threshold downward.

When it does calibrate, it writes a **new, versioned** benchmark set rather
than editing thresholds in place, so a report issued last month still names the
bar it was actually scored against. Areas without sufficient evidence carry
forward their previous bar rather than leaving a hole. Publication is opt-in
(`--publish`) and only ever happens on a `succeeded` run.

## Validation reporting

`/admin/validation` shows what the data actually supports, with two rules:

- **Suppress rather than reveal.** Any band with fewer than 20 students is
  withheld — a statistic over four people is not evidence, and a small enough
  group is an identification.
- **Never present a claim as stronger than its sample.** Every figure carries
  its sample size and a 95% Wilson interval, and the headline claim is only
  produced when the top and bottom bands' intervals do not overlap. Without
  separation there is no demonstrated relationship, and the page says so
  instead of quietly rounding a number into a headline.

Every report states that this is an observed association, not evidence that the
assessment causes placement.

## The evaluation adapter

Mock interview answers are scored behind one interface (`src/lib/evaluation/`),
so the method can change without touching the data model or any caller.

| Method | When | What it judges |
|---|---|---|
| `rubric` (default without credentials) | Always available, free, deterministic | How the answer is *written*: structure, specificity, clarity, relevance. **Not** whether the content is correct. |
| `model` (default when credentials exist) | `ANTHROPIC_API_KEY` set | Whether the answer addresses the question, whether the reasoning holds, and what specifically would improve it. Uses `claude-opus-5` with adaptive thinking and structured outputs. |
| `manual` | `EVALUATION_METHOD=manual` | Nothing — routes every response to a human reviewer. |

Force one with `EVALUATION_METHOD=rubric|model|manual`.

Two properties this design protects:

- **Every evaluation is logged.** Input, output, method, evaluator version,
  model id, token usage and duration all land in `ai_evaluations` before the
  score reaches the student. A score can be traced to the prompt that produced
  it, and a rubric or model change can be re-run against historical inputs.
  The table is append-only through the application role.
- **An evaluator never claims an assessment it did not make.** The rubric
  cannot judge technical correctness, so on a question whose rubric asks for it
  that criterion is returned `assessed: false`, shown as "not assessed", and
  excluded from the weighted score — rather than given a plausible-looking
  number that contradicts the caveat printed above it.

A failure — a rate limit, an outage, a safety decline — marks the response
`awaiting_review`, never zero. An infrastructure problem must not look like a
bad answer on a student's record.

## Data protection in Phase 2

- **Resumes are the most personal artefact in the system.** Staff can see a
  student's *match score*, never the file or its extracted text. This is
  stricter than the rule for assessment attempts, and it is enforced by RLS —
  `tests/rls-phase2.test.ts` asserts a TPO reading `resumes` gets zero rows.
- **Retention is automatic.** Every resume carries a `retain_until`; the worker
  purges the object and clears the extracted text once it passes. Default 180
  days, set by `RESUME_RETENTION_DAYS`. The upload form tells the student the
  date before they upload.
- **The parser service holds nothing.** It takes bytes in and returns JSON. It
  has no database access and no credentials to student data, and it can redact
  contact details before any text reaches a log.
- **Company names can be withheld.** A placement outcome can be recorded with
  `company_anonymised`, in which case reads return "withheld" and only the
  anonymised band is available for analysis.

## Hiring-bar benchmarks are provisional

The seeded thresholds are the platform team's working estimates. They are **not**
derived from placement outcomes. Every benchmark set carries
`is_provisional = true`, and every surface that shows a bar carries a
"provisional benchmark" label plus an explanatory note. Do not present these to
students or universities as validated fact before Phase 3 calibration.

Benchmarks live in `benchmark_sets` / `benchmark_thresholds` and are edited as
data. Publishing a revision means inserting a new version and flipping
`is_active`; existing reports keep the bar they were scored against, because
`attempt_skill_scores` copies it in at scoring time.

---

## Assessment resilience

The worst failure this product can have is a student losing answers they
already typed. Autosave used to be one fire-and-forget call per keystroke: on
failure it showed *"Not saved — check your connection"* and the answer was
gone. Losing a paper does not merely lose a score — it ends an institution's
trust in the platform.

The runner now writes through an **answer outbox**
(`src/lib/assessment/outbox.ts`), modelled as pure data so its rules can be
tested without a browser, a network or a database.

| Guarantee | How |
|---|---|
| An answer survives a dropped connection | Queued and retried with exponential backoff, capped at 30s |
| An answer survives a closed tab or a restarted machine | Mirrored to `localStorage` **before** any network call, and re-queued on load |
| A newer answer is never overwritten by an older one | One pending draft per question; a settle only applies if its sequence number still matches |
| A paper is never submitted with answers still unsent | Submit flushes first and refuses if anything remains, saying how much |
| A whole lab does not stampede a recovering uplink | Full jitter on every backoff interval |
| Typing does not flood a weak link | Free text is debounced ~700ms; choosing an MCQ option saves immediately |

Details worth knowing:

- **Terminal failures are not retried.** *"Time is up"* and *"already
  submitted"* are the server saying no; retrying those would hide the real
  state. Anything unrecognised is treated as transient — the safe direction,
  since a wasted request costs nothing and a discarded answer costs a paper.
- **The status line never claims "saved" while work is outstanding.** It
  distinguishes offline (naming the cause the student can act on) from a patchy
  connection being retried, and says how many answers are waiting.
- **Timer expiry still submits.** The deadline is server-authoritative, so the
  attempt closes regardless; the runner makes one last flush attempt first and
  the student is told if anything did not make it.
- **The local buffer is per attempt**, and other attempts' buffers are cleared
  on load — a shared lab machine must not carry one student's drafts into the
  next student's paper.
- **Every storage access is wrapped.** `localStorage` throws outright in some
  privacy modes and on quota; an assessment that crashed because it could not
  write a *backup* would be worse than one with no backup.

`tests/outbox.test.ts` covers the queue rules including the out-of-order race;
`e2e/07-assessment-resilience.spec.ts` cuts the network in a real browser and
drives the whole recovery.

## Low-bandwidth choices

Target is a student on shared campus or hostel internet.

- ~103 kB of shared JS. Every page except the assessment runner is a Server
  Component; the runner is the only meaningfully interactive surface. It is
  also the heaviest page at ~112 kB first load — the outbox and local buffer
  cost about 2 kB gzipped, which is the one place in this codebase where bytes
  were deliberately spent to protect a student's work rather than saved.
- Recharts is loaded through `next/dynamic` (`components/lazy-charts.tsx`), so
  the chart bundle never blocks first paint. The cohort heatmap is plain CSS
  grid with no client JS at all.
- Sentry's browser SDK is imported dynamically. Importing it statically put
  ~70 kB into the chunk every page loads, even with no DSN configured.
- PostHog loads on idle, after the page is interactive.
- System font stack — no webfont download.
- Admin filters are a plain GET form, so a filtered view is shareable and needs
  no JS.
- Chart animation is off: it costs frames on low-end Android devices and adds
  nothing to a static report.

---

## Configuration

See `.env.example`. Notable switches:

- **`AUTH_PROVIDER`** — `local` or `supabase`. See the deviation note below.
- **`JUDGE0_URL`** — when unset, coding questions are stored but not executed,
  and show on the report as ungraded rather than being marked wrong. Submitted
  code is never executed in the application process.
- **`NEXT_PUBLIC_SENTRY_DSN`**, **`NEXT_PUBLIC_POSTHOG_KEY`** — both optional;
  the features no-op when unset.

### Deviation from the brief: authentication

The brief specifies Supabase Auth or Clerk. Both providers are implemented
behind one interface (`src/lib/auth/types.ts`), and Supabase is wired up in
`src/lib/auth/supabase.ts` — it verifies the Supabase JWT and maps `sub` onto a
row in `users`, which stays the source of truth for tenant and role so neither
can be escalated by tampering with `app_metadata`.

A self-hosted `local` provider (scrypt, server-side sessions) is also included
and is the default, because the build needed to be runnable and verifiable end
to end without external credentials. Set `AUTH_PROVIDER=supabase` and supply
`SUPABASE_JWT_SECRET` to switch; no policy, query or page changes.

Everything else follows the specified stack: Next.js App Router + TypeScript +
Tailwind, PostgreSQL with RLS, Drizzle, Recharts, Judge0, Sentry, PostHog.

### Deployment

Deploy in an India region (AWS `ap-south-1`) for latency and to keep the
data-residency conversation with universities simple. Point `DATABASE_URL` at
the RLS-bound role and keep `MIGRATION_DATABASE_URL` out of the runtime
environment.

---

## Known limitations

- Data export and deletion are a request-to-admin flow, not automated erasure.
  An irreversible cascade across attempts and scores should not be automated
  before there is an audited process behind it.
- The answer outbox retries indefinitely while the tab is open, but it is not
  a background sync: an attempt whose tab is closed with work still unsent will
  recover it only when that same browser reopens the attempt. A service worker
  would close that gap.
- Judge0 still runs synchronously inside the diagnostic submit request. Fine
  for the short programs a diagnostic asks for; it should move to the job queue
  before volume grows.
- The rubric evaluator judges writing quality, not correctness. Set
  `ANTHROPIC_API_KEY` to get content judgement. The UI says which method ran.
- Skill extraction is vocabulary matching against `services/parser/app/skills.py`,
  not inference. A skill described in words the vocabulary does not know is
  reported as a gap. That is why the match report says a gap means the words are
  missing, not the skill.
- The curriculum reference list is curated by hand. `industry_skill_references`
  already carries a `source` column so a job-posting scraper can write into the
  same table without a schema change.
- Student table sorting happens in the page, not in SQL. Fine at a few hundred
  students per tenant; revisit if a tenant gets much larger.
- The practice bank holds 98 items over 9 areas (10–12 each). The draw serves
  unseen questions first, but a determined student can still work through an
  area in two or three sessions, after which it repeats. It degrades gracefully
  rather than failing, but a real cohort will want more.
- The bank is still a starter bank. 115 diagnostic items give every blueprint
  quota at least 2.5x depth, which is enough that papers vary and a retake
  differs — but a heavily used cohort will want more, and item analysis is how
  you decide which of these to keep.
- The faculty view reports on a lecturer's assigned cohort as a whole. It has
  no per-student drill-down by design, which means a lecturer who wants to know
  *who* is struggling still has to ask the placement office.
- Item analysis is a maintenance report, not an automated fix: it names the
  items to look at and never edits, retires or re-keys anything. That is
  deliberate — an editorial decision about a question bank should be made by a
  person — but it does mean the report only helps if somebody reads it.
- Roster invitations are distributed by the placement office, not by us: the
  platform has no email provider wired up, so an import hands back a CSV of
  links rather than sending them. This is the honest shape for a pilot, but a
  provider should go in before a large rollout.
- An employer's `/account` page (their own data, which every signed-in user is
  entitled to) is the one page shared across role chromes. It now renders the
  employer navigation, but it is the only such page — a second one would be
  worth generalising for.
- `npm audit` reports moderate advisories in dev-only transitive dependencies
  (esbuild's dev server via drizzle-kit/vitest, OpenTelemetry via Sentry, uuid).
  None are reachable from the built application. No high or critical advisories.

## Status of the benchmarks

**Every benchmark in this build is still provisional.** Phase 3 ships the
machinery to calibrate them, but calibration needs real placement outcomes and
this build has none — only seeded demo data. The calibration job has been
verified against a synthetic cohort to confirm it both refuses on thin data and
publishes correctly on sufficient data, but nothing here has been calibrated
against reality.

Do not present any hiring bar, readiness score or validation figure from this
build as validated. The UI is written to keep saying so.
