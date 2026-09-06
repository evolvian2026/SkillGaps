CREATE TYPE "public"."calibration_status" AS ENUM('queued', 'running', 'insufficient_data', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."employer_access_status" AS ENUM('pending', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."profile_share_scope" AS ENUM('aggregate_only', 'full_profile');--> statement-breakpoint
CREATE TABLE "calibration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"status" "calibration_status" DEFAULT 'queued' NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"placed_count" integer DEFAULT 0 NOT NULL,
	"correlation" numeric(6, 4),
	"result" jsonb,
	"benchmark_set_id" uuid,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employer_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "employer_access_status" DEFAULT 'pending' NOT NULL,
	"batch_year" integer,
	"branch" text,
	"granted_by" uuid,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"track_id" uuid NOT NULL,
	"description" text,
	"duration_seconds" integer DEFAULT 2700 NOT NULL,
	"tenant_ids" uuid[] DEFAULT '{}' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"email_domains" text[] DEFAULT '{}' NOT NULL,
	"website" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_share_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"scope" "profile_share_scope" DEFAULT 'full_profile' NOT NULL,
	"granted" boolean NOT NULL,
	"notice_text" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verified_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"label" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_benchmark_set_id_benchmark_sets_id_fk" FOREIGN KEY ("benchmark_set_id") REFERENCES "public"."benchmark_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_access_grants" ADD CONSTRAINT "employer_access_grants_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_access_grants" ADD CONSTRAINT "employer_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_access_grants" ADD CONSTRAINT "employer_access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessment_attempts" ADD CONSTRAINT "employer_assessment_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessment_attempts" ADD CONSTRAINT "employer_assessment_attempts_assessment_id_employer_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."employer_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessment_attempts" ADD CONSTRAINT "employer_assessment_attempts_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessment_attempts" ADD CONSTRAINT "employer_assessment_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessments" ADD CONSTRAINT "employer_assessments_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessments" ADD CONSTRAINT "employer_assessments_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_assessments" ADD CONSTRAINT "employer_assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_share_consents" ADD CONSTRAINT "profile_share_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_share_consents" ADD CONSTRAINT "profile_share_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_share_consents" ADD CONSTRAINT "profile_share_consents_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_profiles" ADD CONSTRAINT "verified_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_profiles" ADD CONSTRAINT "verified_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calibration_runs_track_idx" ON "calibration_runs" USING btree ("track_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_grants_unique" ON "employer_access_grants" USING btree ("employer_id","tenant_id");--> statement-breakpoint
CREATE INDEX "employer_grants_employer_idx" ON "employer_access_grants" USING btree ("employer_id","status");--> statement-breakpoint
CREATE INDEX "employer_grants_tenant_idx" ON "employer_access_grants" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_attempt_unique" ON "employer_assessment_attempts" USING btree ("assessment_id","attempt_id");--> statement-breakpoint
CREATE INDEX "employer_attempt_assessment_idx" ON "employer_assessment_attempts" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "employer_assessments_employer_idx" ON "employer_assessments" USING btree ("employer_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "employers_slug_key" ON "employers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "profile_share_user_idx" ON "profile_share_consents" USING btree ("user_id","employer_id","recorded_at");--> statement-breakpoint
CREATE INDEX "profile_share_employer_idx" ON "profile_share_consents" USING btree ("employer_id","granted");--> statement-breakpoint
CREATE UNIQUE INDEX "verified_profiles_public_id_key" ON "verified_profiles" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verified_profiles_token_hash_key" ON "verified_profiles" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verified_profiles_user_idx" ON "verified_profiles" USING btree ("user_id","issued_at");