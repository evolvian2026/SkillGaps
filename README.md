# SkillGaps — Phases 1 & 2

Skill-gap diagnostics for Indian engineering students, with cohort-level
visibility for university Training & Placement Officers.

**Phase 1** — auth and tenancy, the diagnostic assessment engine, the individual
gap report, the read-only institution dashboard, and DPDP-aligned consent and
data-request handling.

**Phase 2** — mock interview simulator with pluggable evaluation, resume vs.
job-description matching, curriculum benchmarking, a placement readiness score,
and placement outcome capture. Adds a background job queue and a separate
Python parsing service.

The employer portal, verified skill profiles and outcome-driven calibration
(Phase 3) are explicitly **not** built yet.

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
  levels, so scores stay comparable between students.
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

## Low-bandwidth choices

Target is a student on shared campus or hostel internet.

- ~103 kB of shared JS. Every page except the assessment runner is a Server
  Component; the runner is the only meaningfully interactive surface.
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
- `npm audit` reports moderate advisories in dev-only transitive dependencies
  (esbuild's dev server via drizzle-kit/vitest, OpenTelemetry via Sentry, uuid).
  None are reachable from the built application. No high or critical advisories.

## Not in these phases

Employer portal, verified skill profiles, outcome-driven calibration and trust
reporting — all Phase 3, and all gated on having real placement outcome data to
calibrate against.
