CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'parsing', 'parsed', 'failed', 'purged');--> statement-breakpoint
CREATE TYPE "public"."evaluation_method" AS ENUM('rubric', 'model', 'manual');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'awaiting_review');--> statement-breakpoint
CREATE TYPE "public"."interview_question_kind" AS ENUM('behavioral', 'technical', 'situational');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('in_progress', 'submitted', 'evaluated', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."placement_status" AS ENUM('not_placed', 'placed', 'opted_out', 'higher_studies', 'unknown');--> statement-breakpoint
CREATE TABLE "ai_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"method" "evaluation_method" NOT NULL,
	"status" "evaluation_status" DEFAULT 'pending' NOT NULL,
	"evaluator_version" text NOT NULL,
	"model_id" text,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error_message" text,
	"usage" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_skill_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"demand_weight" integer DEFAULT 3 NOT NULL,
	"source" text DEFAULT 'curated' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_question_tracks" (
	"question_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	CONSTRAINT "interview_question_tracks_question_id_track_id_pk" PRIMARY KEY("question_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "interview_question_kind" NOT NULL,
	"prompt" text NOT NULL,
	"skill_area_id" uuid,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"rubric_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guidance" text,
	"suggested_time_seconds" integer DEFAULT 240 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"response_text" text,
	"time_spent_ms" integer,
	"score" numeric(5, 2),
	"criterion_scores" jsonb,
	"strengths" text[],
	"improvements" text[],
	"evaluation_status" "evaluation_status" DEFAULT 'pending' NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"status" "interview_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"evaluated_at" timestamp with time zone,
	"overall_score" numeric(5, 2),
	"evaluation_method" "evaluation_method",
	"summary_feedback" text
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"title" text NOT NULL,
	"company" text,
	"track_id" uuid,
	"raw_text" text NOT NULL,
	"extracted_keywords" jsonb,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "placement_status" DEFAULT 'unknown' NOT NULL,
	"role" text,
	"company" text,
	"company_anonymised" boolean DEFAULT false NOT NULL,
	"package_band" text,
	"offer_date" timestamp with time zone,
	"recorded_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"diagnostic_percent" numeric(5, 2),
	"interview_percent" numeric(5, 2),
	"resume_match_percent" numeric(5, 2),
	"components_present" integer NOT NULL,
	"weights_used" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_weights" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"diagnostic_weight" numeric(5, 2) DEFAULT '0.5' NOT NULL,
	"interview_weight" numeric(5, 2) DEFAULT '0.3' NOT NULL,
	"resume_weight" numeric(5, 2) DEFAULT '0.2' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "resume_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"resume_id" uuid NOT NULL,
	"job_description_id" uuid NOT NULL,
	"status" "evaluation_status" DEFAULT 'pending' NOT NULL,
	"match_score" numeric(5, 2),
	"matched_keywords" jsonb,
	"missing_keywords" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"extracted_text" text,
	"extracted_skills" jsonb,
	"parse_error" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "syllabus_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"branch" text,
	"semester" integer,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_skill_references" ADD CONSTRAINT "industry_skill_references_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_question_tracks" ADD CONSTRAINT "interview_question_tracks_question_id_interview_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_question_tracks" ADD CONSTRAINT "interview_question_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_question_id_interview_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_weights" ADD CONSTRAINT "readiness_weights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_weights" ADD CONSTRAINT "readiness_weights_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_matches" ADD CONSTRAINT "resume_matches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_matches" ADD CONSTRAINT "resume_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_matches" ADD CONSTRAINT "resume_matches_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_matches" ADD CONSTRAINT "resume_matches_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_subjects" ADD CONSTRAINT "syllabus_subjects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_subjects" ADD CONSTRAINT "syllabus_subjects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_evaluations_subject_idx" ON "ai_evaluations" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ai_evaluations_tenant_idx" ON "ai_evaluations" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "industry_skill_refs_area_idx" ON "industry_skill_references" USING btree ("skill_area_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "industry_skill_refs_topic_key" ON "industry_skill_references" USING btree ("skill_area_id","topic");--> statement-breakpoint
CREATE INDEX "interview_question_tracks_track_idx" ON "interview_question_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "interview_questions_kind_idx" ON "interview_questions" USING btree ("kind","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_responses_position_key" ON "interview_responses" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "interview_responses_session_idx" ON "interview_responses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "interview_sessions_user_idx" ON "interview_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "interview_sessions_tenant_idx" ON "interview_sessions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "job_descriptions_tenant_idx" ON "job_descriptions" USING btree ("tenant_id","is_shared");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_outcomes_user_key" ON "placement_outcomes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_tenant_idx" ON "placement_outcomes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "readiness_scores_user_key" ON "readiness_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "readiness_scores_tenant_idx" ON "readiness_scores" USING btree ("tenant_id","score");--> statement-breakpoint
CREATE INDEX "resume_matches_user_idx" ON "resume_matches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_matches_pair_key" ON "resume_matches" USING btree ("resume_id","job_description_id");--> statement-breakpoint
CREATE INDEX "resumes_user_idx" ON "resumes" USING btree ("user_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "resumes_retention_idx" ON "resumes" USING btree ("retain_until","purged_at");--> statement-breakpoint
CREATE INDEX "syllabus_subjects_tenant_idx" ON "syllabus_subjects" USING btree ("tenant_id","branch");