CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'expired', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('pending', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."data_request_type" AS ENUM('export', 'delete');--> statement-breakpoint
CREATE TYPE "public"."integrity_event_type" AS ENUM('tab_blur', 'tab_focus', 'paste_blocked', 'copy_blocked', 'fullscreen_exit', 'fast_completion', 'rapid_answer', 'resumed_attempt');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('mcq', 'short', 'code');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'faculty', 'admin', 'employer', 'super_admin');--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"selected_option_id" uuid,
	"response_text" text,
	"language_id" integer,
	"execution_result" jsonb,
	"is_correct" boolean,
	"points_awarded" numeric(6, 2),
	"time_spent_ms" integer,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"points_possible" integer DEFAULT 1 NOT NULL,
	"option_order" uuid[]
);
--> statement-breakpoint
CREATE TABLE "attempt_skill_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"score" numeric(8, 2) NOT NULL,
	"max_score" numeric(8, 2) NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"hiring_bar_percent" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"benchmark_set_id" uuid,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"duration_seconds" integer NOT NULL,
	"total_score" numeric(8, 2),
	"max_score" numeric(8, 2),
	"percent" numeric(5, 2),
	"integrity_flags" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"label" text NOT NULL,
	"is_provisional" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"source_note" text,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark_set_id" uuid NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"hiring_bar_percent" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"policy_key" text NOT NULL,
	"policy_version" text NOT NULL,
	"granted" boolean NOT NULL,
	"notice_text" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "data_request_type" NOT NULL,
	"status" "data_request_status" DEFAULT 'pending' NOT NULL,
	"student_note" text,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "integrity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"type" "integrity_event_type" NOT NULL,
	"detail" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"stdin" text DEFAULT '' NOT NULL,
	"expected_stdout" text NOT NULL,
	"is_hidden" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_tracks" (
	"question_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	CONSTRAINT "question_tracks_question_id_track_id_pk" PRIMARY KEY("question_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"language_id" integer,
	"starter_code" text,
	"explanation" text,
	"accepted_answers" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"provider" text,
	"kind" text DEFAULT 'course' NOT NULL,
	"estimated_hours" integer,
	"is_free" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"roll_number" text,
	"branch" text,
	"section" text,
	"batch_year" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"email_domains" text[] DEFAULT '{}' NOT NULL,
	"invite_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_blueprint_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"question_count" integer NOT NULL,
	"weight" numeric(5, 2) DEFAULT '1' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_seconds" integer DEFAULT 2700 NOT NULL,
	"fast_completion_ratio" numeric(4, 3) DEFAULT '0.25' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"password_hash" text,
	"external_auth_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_question_id_attempt_questions_id_fk" FOREIGN KEY ("attempt_question_id") REFERENCES "public"."attempt_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_skill_scores" ADD CONSTRAINT "attempt_skill_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_skill_scores" ADD CONSTRAINT "attempt_skill_scores_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_skill_scores" ADD CONSTRAINT "attempt_skill_scores_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_benchmark_set_id_benchmark_sets_id_fk" FOREIGN KEY ("benchmark_set_id") REFERENCES "public"."benchmark_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_sets" ADD CONSTRAINT "benchmark_sets_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_thresholds" ADD CONSTRAINT "benchmark_thresholds_benchmark_set_id_benchmark_sets_id_fk" FOREIGN KEY ("benchmark_set_id") REFERENCES "public"."benchmark_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_thresholds" ADD CONSTRAINT "benchmark_thresholds_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_events" ADD CONSTRAINT "integrity_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_events" ADD CONSTRAINT "integrity_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_test_cases" ADD CONSTRAINT "question_test_cases_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tracks" ADD CONSTRAINT "question_tracks_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tracks" ADD CONSTRAINT "question_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_blueprint_items" ADD CONSTRAINT "track_blueprint_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_blueprint_items" ADD CONSTRAINT "track_blueprint_items_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_attempt_question_key" ON "answers" USING btree ("attempt_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_questions_position_key" ON "attempt_questions" USING btree ("attempt_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_questions_question_key" ON "attempt_questions" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "attempt_questions_attempt_idx" ON "attempt_questions" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_skill_scores_unique" ON "attempt_skill_scores" USING btree ("attempt_id","skill_area_id");--> statement-breakpoint
CREATE INDEX "attempt_skill_scores_tenant_idx" ON "attempt_skill_scores" USING btree ("tenant_id","skill_area_id");--> statement-breakpoint
CREATE INDEX "attempts_tenant_idx" ON "attempts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "attempts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "attempts_track_idx" ON "attempts" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_sets_track_version_key" ON "benchmark_sets" USING btree ("track_id","version");--> statement-breakpoint
CREATE INDEX "benchmark_sets_active_idx" ON "benchmark_sets" USING btree ("track_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_thresholds_unique" ON "benchmark_thresholds" USING btree ("benchmark_set_id","skill_area_id");--> statement-breakpoint
CREATE INDEX "consent_records_user_idx" ON "consent_records" USING btree ("user_id","policy_key");--> statement-breakpoint
CREATE INDEX "data_requests_tenant_idx" ON "data_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "integrity_events_attempt_idx" ON "integrity_events" USING btree ("attempt_id","type");--> statement-breakpoint
CREATE INDEX "question_options_question_idx" ON "question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_test_cases_question_idx" ON "question_test_cases" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_tracks_track_idx" ON "question_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "questions_skill_area_idx" ON "questions" USING btree ("skill_area_id","is_active");--> statement-breakpoint
CREATE INDEX "questions_difficulty_idx" ON "questions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "resources_skill_area_idx" ON "resources" USING btree ("skill_area_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_areas_code_key" ON "skill_areas" USING btree ("code");--> statement-breakpoint
CREATE INDEX "student_profiles_cohort_idx" ON "student_profiles" USING btree ("tenant_id","batch_year","branch","section");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_invite_code_key" ON "tenants" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "track_blueprint_unique" ON "track_blueprint_items" USING btree ("track_id","skill_area_id");--> statement-breakpoint
CREATE INDEX "track_blueprint_track_idx" ON "track_blueprint_items" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_code_key" ON "tracks" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_external_auth_id_key" ON "users" USING btree ("external_auth_id");--> statement-breakpoint
CREATE INDEX "users_tenant_role_idx" ON "users" USING btree ("tenant_id","role");