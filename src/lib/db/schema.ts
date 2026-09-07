import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ==========================================================================
 * Enums
 * ========================================================================== */

/** Roles are declared up-front, including the ones only later phases use, so
 *  that the RLS/role model never has to be rebuilt in parallel. */
export const userRoleEnum = pgEnum("user_role", [
  "student",
  "faculty",
  "admin", // TPO
  "employer", // Phase 3 — reserved, no grants yet
  "super_admin",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "mcq",
  "short",
  "code",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "expired",
  "abandoned",
]);

export const integrityEventEnum = pgEnum("integrity_event_type", [
  "tab_blur",
  "tab_focus",
  "paste_blocked",
  "copy_blocked",
  "fullscreen_exit",
  "fast_completion",
  "rapid_answer",
  "resumed_attempt",
]);

export const dataRequestTypeEnum = pgEnum("data_request_type", [
  "export",
  "delete",
]);

/**
 * A roster invitation is pending until the student redeems it, or staff revoke
 * it. "Expired" is deliberately not a stored state: it is derived from
 * `expires_at`, so no sweep job is needed to keep the table honest.
 */
export const rosterInvitationStatusEnum = pgEnum("roster_invitation_status", [
  "pending",
  "accepted",
  "revoked",
]);

export const dataRequestStatusEnum = pgEnum("data_request_status", [
  "pending",
  "in_progress",
  "completed",
  "rejected",
]);

/* ==========================================================================
 * Tenancy & identity
 * ========================================================================== */

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Signups from these email domains auto-join this tenant. */
    emailDomains: text("email_domains").array().notNull().default([]),
    /** Alternative join path for students on personal email addresses. */
    inviteCode: text("invite_code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_slug_key").on(t.slug),
    uniqueIndex("tenants_invite_code_key").on(t.inviteCode),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    role: userRoleEnum("role").notNull().default("student"),
    /** Populated only when AUTH_PROVIDER=local. Null under Supabase Auth. */
    passwordHash: text("password_hash"),
    /** Supabase `auth.users.id`, when that provider is in use. */
    externalAuthId: text("external_auth_id"),
    /**
     * Phase 3. Set only for `employer` users, linking them to the organisation
     * whose grants define their reach. Null for students and university staff.
     * Declared here rather than in a separate table so that one identity model
     * still covers every role.
     */
    employerId: uuid("employer_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_external_auth_id_key").on(t.externalAuthId),
    index("users_tenant_role_idx").on(t.tenantId, t.role),
  ],
);

/** Cohort attributes the institution dashboard filters on. */
export const studentProfiles = pgTable(
  "student_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    rollNumber: text("roll_number"),
    branch: text("branch"),
    section: text("section"),
    batchYear: integer("batch_year"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("student_profiles_cohort_idx").on(
      t.tenantId,
      t.batchYear,
      t.branch,
      t.section,
    ),
  ],
);

/**
 * Students an institution has put on its roster but who have not yet joined.
 *
 * A roster import creates invitations, never accounts. Consent under the DPDP
 * Act has to be the student's own act — staff cannot grant it on their behalf,
 * which the RLS on `consent_records` already enforces — so an import that
 * minted live accounts would create users carrying no consent record at all.
 * Instead the institution supplies the cohort attributes it is authoritative
 * for (roll number, branch, section, batch) and the student supplies the
 * password and the consent when they redeem their link.
 *
 * Only the SHA-256 of the join token is stored, for the same reason session
 * cookies and verification tokens are hashed: a database dump yields no
 * working links.
 */
export const rosterInvitations = pgTable(
  "roster_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    rollNumber: text("roll_number"),
    branch: text("branch"),
    section: text("section"),
    batchYear: integer("batch_year"),
    tokenHash: text("token_hash").notNull(),
    status: rosterInvitationStatusEnum("status").notNull().default("pending"),
    /** The staff member who imported the row, kept for the audit trail. */
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Set once redeemed, linking the invitation to the account it became. */
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One invitation per email per institution, so re-importing the same
    // roster updates rows rather than duplicating them.
    uniqueIndex("roster_invitations_tenant_email_key").on(t.tenantId, t.email),
    uniqueIndex("roster_invitations_token_hash_key").on(t.tokenHash),
    index("roster_invitations_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/**
 * Who teaches what, to whom.
 *
 * The faculty view needs to know a lecturer's own sections, and there was no
 * way to express that: `faculty` was a staff role with no teaching attached, so
 * every lecturer saw the whole institution's placement dashboard and nothing
 * about their own class.
 *
 * Assignments are written by the placement office, never by the lecturer. A
 * faculty member who could assign themselves a cohort could grant themselves
 * visibility of any section in the institution, which is exactly the thing this
 * table has to make impossible — so the RLS admits `admin` and `super_admin`
 * for writes and all staff for reads.
 */
export const teachingAssignments = pgTable(
  "teaching_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => syllabusSubjects.id, { onDelete: "cascade" }),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The cohort taught. Null means "every value" — a lecturer taking all
     * sections of a branch should not need one row per section.
     */
    branch: text("branch"),
    section: text("section"),
    batchYear: integer("batch_year"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("teaching_assignments_faculty_idx").on(t.tenantId, t.facultyId),
    index("teaching_assignments_subject_idx").on(t.subjectId),
  ],
);

/** Server-side sessions. Only used when AUTH_PROVIDER=local. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token; the raw token is never stored. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_key").on(t.tokenHash)],
);

/* ==========================================================================
 * Shared skill taxonomy
 *
 * These tables are global, not tenant-scoped: the question bank and taxonomy
 * are shared across universities. Everything here is data-driven so new
 * tracks, skill areas and questions are added without a code change.
 * ========================================================================== */

export const skillAreas = pgTable(
  "skill_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("skill_areas_code_key").on(t.code)],
);

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Wall-clock limit for one attempt. */
    durationSeconds: integer("duration_seconds").notNull().default(2700),
    /**
     * Attempts finishing faster than this fraction of the limit are flagged
     * (not blocked) for review.
     */
    fastCompletionRatio: numeric("fast_completion_ratio", {
      precision: 4,
      scale: 3,
    })
      .notNull()
      .default("0.25"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [uniqueIndex("tracks_code_key").on(t.code)],
);

/**
 * How one attempt at a track is assembled: how many questions to draw from
 * each skill area, and how heavily that area weighs in the overall score.
 */
export const trackBlueprintItems = pgTable(
  "track_blueprint_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "restrict" }),
    questionCount: integer("question_count").notNull(),
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1"),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("track_blueprint_unique").on(t.trackId, t.skillAreaId),
    index("track_blueprint_track_idx").on(t.trackId),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "restrict" }),
    type: questionTypeEnum("type").notNull(),
    prompt: text("prompt").notNull(),
    /** 1 = easy, 2 = medium, 3 = hard. Used to spread difficulty per attempt. */
    difficulty: integer("difficulty").notNull().default(2),
    points: integer("points").notNull().default(1),
    /** Code questions only. Judge0 language id, e.g. 71 = Python 3. */
    languageId: integer("language_id"),
    starterCode: text("starter_code"),
    /** Shown on the report after submission, never during the attempt. */
    explanation: text("explanation"),
    /** Exact-match answers for `short` questions, compared case-insensitively. */
    acceptedAnswers: text("accepted_answers").array(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("questions_skill_area_idx").on(t.skillAreaId, t.isActive),
    index("questions_difficulty_idx").on(t.difficulty),
  ],
);

/** A question can appear in more than one track's bank. */
export const questionTracks = pgTable(
  "question_tracks",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.trackId] }),
    index("question_tracks_track_idx").on(t.trackId),
  ],
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [index("question_options_question_idx").on(t.questionId)],
);

/** Test cases for `code` questions, executed by Judge0 — never in-process. */
export const questionTestCases = pgTable(
  "question_test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    stdin: text("stdin").notNull().default(""),
    expectedStdout: text("expected_stdout").notNull(),
    /** Hidden cases are scored but never returned to the client. */
    isHidden: boolean("is_hidden").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [index("question_test_cases_question_idx").on(t.questionId)],
);

/**
 * "Hiring bar" benchmarks.
 *
 * Versioned as a set rather than edited in place, so that every report can
 * name the thresholds it was scored against. Until real placement outcomes
 * exist to calibrate against, sets stay `is_provisional = true` and the UI
 * labels them as unvalidated.
 */
export const benchmarkSets = pgTable(
  "benchmark_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    label: text("label").notNull(),
    /** True until validated against real outcome data. Surfaced in the UI. */
    isProvisional: boolean("is_provisional").notNull().default(true),
    isActive: boolean("is_active").notNull().default(false),
    sourceNote: text("source_note"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("benchmark_sets_track_version_key").on(t.trackId, t.version),
    index("benchmark_sets_active_idx").on(t.trackId, t.isActive),
  ],
);

export const benchmarkThresholds = pgTable(
  "benchmark_thresholds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    benchmarkSetId: uuid("benchmark_set_id")
      .notNull()
      .references(() => benchmarkSets.id, { onDelete: "cascade" }),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "restrict" }),
    /** Percentage a student is expected to reach in this area, 0-100. */
    hiringBarPercent: numeric("hiring_bar_percent", { precision: 5, scale: 2 })
      .notNull(),
  },
  (t) => [
    uniqueIndex("benchmark_thresholds_unique").on(t.benchmarkSetId, t.skillAreaId),
  ],
);

/** Manually curated free resources, mapped to a skill area. */
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    provider: text("provider"),
    kind: text("kind").notNull().default("course"),
    estimatedHours: integer("estimated_hours"),
    isFree: boolean("is_free").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("resources_skill_area_idx").on(t.skillAreaId, t.isActive)],
);

/* ==========================================================================
 * Attempts & scoring (tenant-scoped)
 * ========================================================================== */

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised onto every tenant-scoped row so RLS never needs a join. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    /** Which thresholds this attempt's report was scored against. */
    benchmarkSetId: uuid("benchmark_set_id").references(() => benchmarkSets.id, {
      onDelete: "set null",
    }),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Server-authoritative deadline. The client countdown is display only. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull(),
    totalScore: numeric("total_score", { precision: 8, scale: 2 }),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }),
    percent: numeric("percent", { precision: 5, scale: 2 }),
    /** Rolled-up integrity summary, e.g. { tab_blur: 3, fast_completion: 1 }. */
    integrityFlags: jsonb("integrity_flags").notNull().default({}),
  },
  (t) => [
    index("attempts_tenant_idx").on(t.tenantId, t.status),
    index("attempts_user_idx").on(t.userId, t.startedAt),
    index("attempts_track_idx").on(t.trackId),
  ],
);

/**
 * The frozen, per-attempt question set. Selection and ordering are randomised
 * per attempt and stored here, so a reload cannot reshuffle to fish for an
 * easier paper.
 */
export const attemptQuestions = pgTable(
  "attempt_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    pointsPossible: integer("points_possible").notNull().default(1),
    /** Randomised option order for this attempt, as option ids. */
    optionOrder: uuid("option_order").array(),
  },
  (t) => [
    uniqueIndex("attempt_questions_position_key").on(t.attemptId, t.position),
    uniqueIndex("attempt_questions_question_key").on(t.attemptId, t.questionId),
    index("attempt_questions_attempt_idx").on(t.attemptId),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    attemptQuestionId: uuid("attempt_question_id")
      .notNull()
      .references(() => attemptQuestions.id, { onDelete: "cascade" }),
    selectedOptionId: uuid("selected_option_id").references(
      () => questionOptions.id,
      { onDelete: "set null" },
    ),
    /** Raw answer text for `short`, source for `code`. Always retained. */
    responseText: text("response_text"),
    languageId: integer("language_id"),
    /** Judge0 run summary: tokens, per-case pass/fail, stderr. */
    executionResult: jsonb("execution_result"),
    isCorrect: boolean("is_correct"),
    pointsAwarded: numeric("points_awarded", { precision: 6, scale: 2 }),
    timeSpentMs: integer("time_spent_ms"),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("answers_attempt_question_key").on(t.attemptQuestionId)],
);

export const attemptSkillScores = pgTable(
  "attempt_skill_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "restrict" }),
    score: numeric("score", { precision: 8, scale: 2 }).notNull(),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }).notNull(),
    percent: numeric("percent", { precision: 5, scale: 2 }).notNull(),
    /** Copied from the benchmark set at scoring time for a stable report. */
    hiringBarPercent: numeric("hiring_bar_percent", { precision: 5, scale: 2 }),
  },
  (t) => [
    uniqueIndex("attempt_skill_scores_unique").on(t.attemptId, t.skillAreaId),
    index("attempt_skill_scores_tenant_idx").on(t.tenantId, t.skillAreaId),
  ],
);

/** Raw integrity signals. Flagged for review — never used to block a student. */
export const integrityEvents = pgTable(
  "integrity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: integrityEventEnum("type").notNull(),
    detail: jsonb("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("integrity_events_attempt_idx").on(t.attemptId, t.type)],
);

/* ==========================================================================
 * Privacy (DPDP)
 * ========================================================================== */

/**
 * Consent is recorded as an append-only event (who, what version, when),
 * not a boolean on the user row, so withdrawal and re-grant stay auditable.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    policyKey: text("policy_key").notNull(),
    policyVersion: text("policy_version").notNull(),
    granted: boolean("granted").notNull(),
    /** Verbatim text shown at the time of consent. */
    noticeText: text("notice_text").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("consent_records_user_idx").on(t.userId, t.policyKey)],
);

/** Student-initiated export/erasure requests, resolved by a TPO for the MVP. */
export const dataRequests = pgTable(
  "data_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: dataRequestTypeEnum("type").notNull(),
    status: dataRequestStatusEnum("status").notNull().default("pending"),
    studentNote: text("student_note"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("data_requests_tenant_idx").on(t.tenantId, t.status)],
);

/* ==========================================================================
 * PHASE 2
 *
 * Everything below reuses the Phase 1 taxonomy (`skill_areas`, `tracks`) and
 * the same tenant/role model rather than introducing a parallel structure.
 * ========================================================================== */

export const interviewQuestionKindEnum = pgEnum("interview_question_kind", [
  "behavioral",
  "technical",
  "situational",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "in_progress",
  "submitted",
  "evaluated",
  "abandoned",
]);

/** How a response was scored. Recorded per evaluation so mixed methods stay
 *  distinguishable when the adapter is swapped. */
export const evaluationMethodEnum = pgEnum("evaluation_method", [
  "rubric",
  "model",
  "manual",
]);

export const evaluationStatusEnum = pgEnum("evaluation_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "awaiting_review",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "parsing",
  "parsed",
  "failed",
  "purged",
]);

export const placementStatusEnum = pgEnum("placement_status", [
  "not_placed",
  "placed",
  "opted_out",
  "higher_studies",
  "unknown",
]);

/* --------------------------------------------------------------------------
 * Mock interview simulator
 * ------------------------------------------------------------------------ */

/**
 * Interview question bank. Shared taxonomy like the diagnostic bank, and tied
 * to the same `skill_areas` so interview performance and diagnostic
 * performance can be compared on one axis.
 */
export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: interviewQuestionKindEnum("kind").notNull(),
    prompt: text("prompt").notNull(),
    /** Optional — behavioural questions are not tied to a technical area. */
    skillAreaId: uuid("skill_area_id").references(() => skillAreas.id, {
      onDelete: "set null",
    }),
    difficulty: integer("difficulty").notNull().default(2),
    /** What a strong answer covers. Feeds the rubric and the model prompt. */
    rubricCriteria: jsonb("rubric_criteria").notNull().default([]),
    /** Shown to the student after evaluation, never before. */
    guidance: text("guidance"),
    suggestedTimeSeconds: integer("suggested_time_seconds").notNull().default(240),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("interview_questions_kind_idx").on(t.kind, t.isActive)],
);

export const interviewQuestionTracks = pgTable(
  "interview_question_tracks",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => interviewQuestions.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.trackId] }),
    index("interview_question_tracks_track_idx").on(t.trackId),
  ],
);

/** One sitting of the mock interview. */
export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    status: interviewStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
    /** 0-100, averaged across responses once every one is evaluated. */
    overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
    /** Which method produced `overallScore`, for auditability. */
    evaluationMethod: evaluationMethodEnum("evaluation_method"),
    summaryFeedback: text("summary_feedback"),
  },
  (t) => [
    index("interview_sessions_user_idx").on(t.userId, t.startedAt),
    index("interview_sessions_tenant_idx").on(t.tenantId, t.status),
  ],
);

export const interviewResponses = pgTable(
  "interview_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => interviewQuestions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    responseText: text("response_text"),
    timeSpentMs: integer("time_spent_ms"),
    /** 0-100 for this single response. */
    score: numeric("score", { precision: 5, scale: 2 }),
    /** Per-criterion breakdown, shaped by the rubric. */
    criterionScores: jsonb("criterion_scores"),
    strengths: text("strengths").array(),
    improvements: text("improvements").array(),
    evaluationStatus: evaluationStatusEnum("evaluation_status")
      .notNull()
      .default("pending"),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("interview_responses_position_key").on(t.sessionId, t.position),
    index("interview_responses_session_idx").on(t.sessionId),
  ],
);

/* --------------------------------------------------------------------------
 * Evaluation audit log
 * ------------------------------------------------------------------------ */

/**
 * Every evaluation the adapter performs, input and output, whatever the
 * method.
 *
 * Two reasons this exists rather than only storing the resulting score:
 * a score can be traced back to exactly what produced it, and a rubric or
 * model change can be re-run against historical inputs to see what would move.
 * Rows are append-only — a re-run writes a new row rather than editing the old.
 */
export const aiEvaluations = pgTable(
  "ai_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** e.g. "interview_response". Kept loose so new subjects need no migration. */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    method: evaluationMethodEnum("method").notNull(),
    status: evaluationStatusEnum("status").notNull().default("pending"),
    /** Identifies the rubric revision or model that ran, for re-run diffing. */
    evaluatorVersion: text("evaluator_version").notNull(),
    modelId: text("model_id"),
    /** Verbatim input: prompt, rubric, and the response being scored. */
    input: jsonb("input").notNull(),
    /** Verbatim output, before any mapping onto our own columns. */
    output: jsonb("output"),
    errorMessage: text("error_message"),
    /** Token counts and cost, when the method reports them. */
    usage: jsonb("usage"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_evaluations_subject_idx").on(t.subjectType, t.subjectId),
    index("ai_evaluations_tenant_idx").on(t.tenantId, t.createdAt),
  ],
);

/* --------------------------------------------------------------------------
 * Resume vs job description matching
 * ------------------------------------------------------------------------ */

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Object storage key. The file itself never touches this database. */
    storageKey: text("storage_key").notNull(),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    /** Extracted plain text. Cleared when the file is purged. */
    extractedText: text("extracted_text"),
    /** Skills the parser found, mapped onto `skill_areas` where possible. */
    extractedSkills: jsonb("extracted_skills"),
    parseError: text("parse_error"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * DPDP data minimisation: resumes are not kept indefinitely. The retention
     * sweep purges the object and the extracted text once this passes.
     */
    retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (t) => [
    index("resumes_user_idx").on(t.userId, t.uploadedAt),
    index("resumes_retention_idx").on(t.retainUntil, t.purgedAt),
  ],
);

/**
 * A target job description. Tenant-scoped: a TPO can publish JDs for their
 * cohort, and a student can paste their own.
 */
export const jobDescriptions = pgTable(
  "job_descriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Null for a JD published to the whole cohort by staff. */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    company: text("company"),
    trackId: uuid("track_id").references(() => tracks.id, {
      onDelete: "set null",
    }),
    rawText: text("raw_text").notNull(),
    /** Keywords extracted by the Python service, with weights. */
    extractedKeywords: jsonb("extracted_keywords"),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    /** Staff-published JDs are visible to the whole tenant. */
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("job_descriptions_tenant_idx").on(t.tenantId, t.isShared)],
);

export const resumeMatches = pgTable(
  "resume_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    jobDescriptionId: uuid("job_description_id")
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: "cascade" }),
    status: evaluationStatusEnum("status").notNull().default("pending"),
    /** 0-100 coverage of the JD's weighted keywords. */
    matchScore: numeric("match_score", { precision: 5, scale: 2 }),
    matchedKeywords: jsonb("matched_keywords"),
    /** What the JD asks for and the resume never mentions. */
    missingKeywords: jsonb("missing_keywords"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("resume_matches_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("resume_matches_pair_key").on(t.resumeId, t.jobDescriptionId),
  ],
);

/* --------------------------------------------------------------------------
 * Curriculum benchmarking
 * ------------------------------------------------------------------------ */

/**
 * The reference list of currently in-demand skills, per skill area.
 *
 * Maintained by the platform team for now. When a job-posting scraper exists,
 * it writes here rather than to a second parallel table — `source` records
 * where each entry came from.
 */
export const industrySkillReferences = pgTable(
  "industry_skill_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillAreaId: uuid("skill_area_id")
      .notNull()
      .references(() => skillAreas.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    /** Alternate spellings a syllabus might use, for matching. */
    aliases: text("aliases").array().notNull().default([]),
    /** 1 = nice to have, 5 = expected in nearly every posting. */
    demandWeight: integer("demand_weight").notNull().default(3),
    /** "curated" today; "scraped" once a JD source feeds this. */
    source: text("source").notNull().default("curated"),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("industry_skill_refs_area_idx").on(t.skillAreaId, t.isActive),
    uniqueIndex("industry_skill_refs_topic_key").on(t.skillAreaId, t.topic),
  ],
);

/** A subject in the institution's own syllabus. */
export const syllabusSubjects = pgTable(
  "syllabus_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code"),
    name: text("name").notNull(),
    branch: text("branch"),
    semester: integer("semester"),
    /** Free-text topic list as entered or uploaded. */
    topics: text("topics").array().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("syllabus_subjects_tenant_idx").on(t.tenantId, t.branch)],
);

/* --------------------------------------------------------------------------
 * Placement readiness
 * ------------------------------------------------------------------------ */

/**
 * Per-tenant weighting of the readiness components.
 *
 * A row per tenant, so a university that does not run mock interviews can
 * weight that component to zero rather than having every student penalised
 * for a component they were never offered.
 */
export const readinessWeights = pgTable(
  "readiness_weights",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    diagnosticWeight: numeric("diagnostic_weight", { precision: 5, scale: 2 })
      .notNull()
      .default("0.5"),
    interviewWeight: numeric("interview_weight", { precision: 5, scale: 2 })
      .notNull()
      .default("0.3"),
    resumeWeight: numeric("resume_weight", { precision: 5, scale: 2 })
      .notNull()
      .default("0.2"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
);

/**
 * Computed readiness score per student.
 *
 * Materialised rather than computed on read: the dashboard sorts on it, and
 * recomputing a three-part composite for every row of a cohort on every page
 * load is the kind of thing that quietly becomes the slowest query in the app.
 * Refreshed by a background job when any component changes.
 */
export const readinessScores = pgTable(
  "readiness_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 0-100 composite. */
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    diagnosticPercent: numeric("diagnostic_percent", { precision: 5, scale: 2 }),
    interviewPercent: numeric("interview_percent", { precision: 5, scale: 2 }),
    resumeMatchPercent: numeric("resume_match_percent", { precision: 5, scale: 2 }),
    /**
     * Which components the student actually has data for. A score built from
     * one component out of three should not read the same as a complete one.
     */
    componentsPresent: integer("components_present").notNull(),
    /** The weights in force when this was computed. */
    weightsUsed: jsonb("weights_used").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("readiness_scores_user_key").on(t.userId),
    index("readiness_scores_tenant_idx").on(t.tenantId, t.score),
  ],
);

/* --------------------------------------------------------------------------
 * Outcome tracking
 *
 * Captured now, analysed later. Phase 3 calibrates hiring bars against this,
 * so the priority here is clean, consistent capture rather than features.
 * ------------------------------------------------------------------------ */

export const placementOutcomes = pgTable(
  "placement_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: placementStatusEnum("status").notNull().default("unknown"),
    role: text("role"),
    /** Optional by design — some universities will not share employer names. */
    company: text("company"),
    /**
     * When set, `company` is withheld from every read path and only the
     * anonymised bucket is reported.
     */
    companyAnonymised: boolean("company_anonymised").notNull().default(false),
    /** Coarse band rather than exact CTC — less sensitive, still analysable. */
    packageBand: text("package_band"),
    offerDate: timestamp("offer_date", { withTimezone: true }),
    /** Whether the student or staff recorded it, for data-quality analysis. */
    recordedBy: uuid("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("placement_outcomes_user_key").on(t.userId),
    index("placement_outcomes_tenant_idx").on(t.tenantId, t.status),
  ],
);

/* ==========================================================================
 * PHASE 3
 *
 * Employers are a new tenant *type*, not a new permission system: they reuse
 * `users.role = 'employer'` and the same RLS helpers. What changes is that an
 * employer's reach is defined by explicit grants rather than by their own
 * tenant, because an employer legitimately needs to see across universities —
 * but only the ones that have admitted them.
 * ========================================================================== */

export const employerAccessStatusEnum = pgEnum("employer_access_status", [
  "pending",
  "active",
  "revoked",
]);

export const profileShareScopeEnum = pgEnum("profile_share_scope", [
  "aggregate_only",
  "full_profile",
]);

export const calibrationStatusEnum = pgEnum("calibration_status", [
  "queued",
  "running",
  "insufficient_data",
  "succeeded",
  "failed",
]);

/* --------------------------------------------------------------------------
 * Employer organisations
 * ------------------------------------------------------------------------ */

/**
 * An employer organisation.
 *
 * Deliberately a separate table from `tenants`: a university tenant owns
 * students and their data, whereas an employer owns none and only ever holds
 * granted, consented views. Conflating them would make it far too easy to
 * write a policy that accidentally treats an employer like a data owner.
 */
export const employers = pgTable(
  "employers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Signups from these domains join this employer. */
    emailDomains: text("email_domains").array().notNull().default([]),
    website: text("website"),
    /**
     * The employer's own `tenants` row.
     *
     * Employer users still need a tenant to satisfy the identity model, and
     * giving them one that owns no students means every existing
     * student-scoped policy already returns nothing for them — no
     * special-casing, and no chance of a policy that forgot employers exist.
     */
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employers_slug_key").on(t.slug),
    uniqueIndex("employers_tenant_key").on(t.tenantId),
  ],
);

/**
 * Which universities an employer may see, and at what granularity.
 *
 * Granted by the university, never self-serve. Without an `active` row here an
 * employer can see nothing at all about a tenant — this table is the whole of
 * their reach.
 */
export const employerAccessGrants = pgTable(
  "employer_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: employerAccessStatusEnum("status").notNull().default("pending"),
    /** Optional narrowing to a cohort within the university. */
    batchYear: integer("batch_year"),
    branch: text("branch"),
    /** Who at the university granted it, and when. */
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employer_grants_unique").on(t.employerId, t.tenantId),
    index("employer_grants_employer_idx").on(t.employerId, t.status),
    index("employer_grants_tenant_idx").on(t.tenantId, t.status),
  ],
);

/**
 * A student's decision to share their profile with a specific employer.
 *
 * An auditable event, not a boolean on a row: who, what scope, when, and what
 * they were shown. Withdrawal is a new row with `granted = false`, so the
 * history of a share can always be reconstructed.
 */
export const profileShareConsents = pgTable(
  "profile_share_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    scope: profileShareScopeEnum("scope").notNull().default("full_profile"),
    granted: boolean("granted").notNull(),
    /** Verbatim text the student agreed to, as with signup consent. */
    noticeText: text("notice_text").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("profile_share_user_idx").on(t.userId, t.employerId, t.recordedAt),
    index("profile_share_employer_idx").on(t.employerId, t.granted),
  ],
);

/* --------------------------------------------------------------------------
 * Employer-created assessments
 *
 * Reuses the Phase 1 question bank and blueprint machinery rather than a
 * parallel one: an employer drive is a `track`-shaped selection over the same
 * `questions`, scoped to the cohorts they have been granted.
 * ------------------------------------------------------------------------ */

export const employerAssessments = pgTable(
  "employer_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The track whose question bank and blueprint this draws from. */
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "restrict" }),
    description: text("description"),
    durationSeconds: integer("duration_seconds").notNull().default(2700),
    /** Which granted cohorts may take it. Empty means every granted tenant. */
    tenantIds: uuid("tenant_ids").array().notNull().default([]),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("employer_assessments_employer_idx").on(t.employerId, t.isActive)],
);

/**
 * Links an employer assessment to the diagnostic attempt a student made for
 * it, so results flow through exactly the same scoring path as any other
 * attempt rather than a second, less-tested one.
 */
export const employerAssessmentAttempts = pgTable(
  "employer_assessment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => employerAssessments.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employer_attempt_unique").on(t.assessmentId, t.attemptId),
    index("employer_attempt_assessment_idx").on(t.assessmentId),
  ],
);

/* --------------------------------------------------------------------------
 * Verified skill profiles
 * ------------------------------------------------------------------------ */

/**
 * A shareable, verifiable snapshot of a student's record.
 *
 * The token is a random secret held only by the student and whoever they give
 * it to; the database stores its SHA-256, so a leaked dump cannot be replayed
 * as a working link. The snapshot itself is frozen at issue time — a verifier
 * checking a link months later sees what was actually claimed, not a moving
 * target — and the student can revoke it at any moment.
 */
export const verifiedProfiles = pgTable(
  "verified_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Public, non-secret id shown in the UI and quoted in support requests. */
    publicId: text("public_id").notNull(),
    /** SHA-256 of the shareable token. The token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    /** Frozen snapshot of what was verified, rendered on the public page. */
    snapshot: jsonb("snapshot").notNull(),
    label: text("label"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Incremented on each successful verification, for the student's view. */
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("verified_profiles_public_id_key").on(t.publicId),
    uniqueIndex("verified_profiles_token_hash_key").on(t.tokenHash),
    index("verified_profiles_user_idx").on(t.userId, t.issuedAt),
  ],
);

/* --------------------------------------------------------------------------
 * Outcome-driven calibration
 * ------------------------------------------------------------------------ */

/**
 * One run of the calibration analysis.
 *
 * Recorded whatever the result, including `insufficient_data` — a run that
 * declined to produce thresholds is exactly the evidence needed to explain why
 * the benchmarks are still provisional.
 */
/**
 * Item analysis: is the question bank actually any good?
 *
 * Global, not tenant-scoped, for the same reason the bank itself is: an item's
 * statistics only mean anything pooled across every institution that has
 * answered it. That makes these rows cross-tenant by construction, which is
 * why the RLS on them admits `super_admin` alone — a TPO reading them would be
 * seeing other institutions' response behaviour, about a bank they do not own.
 */
export const itemAnalysisRuns = pgTable("item_analysis_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Null means the whole bank; set when a run was scoped to one track. */
  trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
  /** Items with enough responses to analyse, and those skipped for want of them. */
  analysedCount: integer("analysed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  urgentCount: integer("urgent_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  okCount: integer("ok_count").notNull().default(0),
  /** Responses considered, after excluding integrity-flagged attempts. */
  responseCount: integer("response_count").notNull().default(0),
  minResponses: integer("min_responses").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One item's statistics from one run.
 *
 * Kept per run rather than overwritten so the bank's history is legible: an
 * item that was fine last term and is failing now is a different problem from
 * one that never worked, and only a series can tell them apart.
 */
export const itemStatistics = pgTable(
  "item_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => itemAnalysisRuns.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    responses: integer("responses").notNull(),
    /** Proportion answering correctly. Confusingly, a HIGH value means EASY. */
    facility: numeric("facility", { precision: 6, scale: 4 }),
    /** Corrected point-biserial: this item against the rest of the paper. */
    discrimination: numeric("discrimination", { precision: 6, scale: 4 }),
    discriminationP: numeric("discrimination_p", { precision: 8, scale: 6 }),
    /** urgent | review | ok | not_analysed. */
    verdict: text("verdict").notNull(),
    flags: text("flags").array().notNull().default([]),
    message: text("message").notNull(),
    /** Per-option selection rates and chooser calibre, for MCQ items. */
    distractors: jsonb("distractors"),
  },
  (t) => [
    uniqueIndex("item_statistics_run_question_key").on(t.runId, t.questionId),
    index("item_statistics_verdict_idx").on(t.runId, t.verdict),
  ],
);

export const calibrationRuns = pgTable(
  "calibration_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    status: calibrationStatusEnum("status").notNull().default("queued"),
    /** How many students with both a score and a recorded outcome were used. */
    sampleSize: integer("sample_size").notNull().default(0),
    placedCount: integer("placed_count").notNull().default(0),
    /** Point-biserial correlation between score and placement. */
    correlation: numeric("correlation", { precision: 6, scale: 4 }),
    /** Per-skill-area analysis, thresholds and diagnostics. */
    result: jsonb("result"),
    /** The benchmark set this run produced, when it produced one. */
    benchmarkSetId: uuid("benchmark_set_id").references(() => benchmarkSets.id, {
      onDelete: "set null",
    }),
    message: text("message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("calibration_runs_track_idx").on(t.trackId, t.startedAt)],
);
