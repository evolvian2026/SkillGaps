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
