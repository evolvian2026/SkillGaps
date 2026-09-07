CREATE TYPE "public"."question_pool" AS ENUM('diagnostic', 'practice');--> statement-breakpoint
CREATE TABLE "practice_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"selected_option_id" uuid,
	"is_correct" boolean,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill_check_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"selected_option_id" uuid,
	"is_correct" boolean
);
--> statement-breakpoint
CREATE TABLE "skill_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_area_id" uuid NOT NULL,
	"baseline_percent" numeric(5, 2),
	"percent" numeric(5, 2),
	"correct_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "pool" "question_pool" DEFAULT 'diagnostic' NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_check_questions" ADD CONSTRAINT "skill_check_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_check_questions" ADD CONSTRAINT "skill_check_questions_check_id_skill_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."skill_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_check_questions" ADD CONSTRAINT "skill_check_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_check_questions" ADD CONSTRAINT "skill_check_questions_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_checks" ADD CONSTRAINT "skill_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_checks" ADD CONSTRAINT "skill_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_checks" ADD CONSTRAINT "skill_checks_skill_area_id_skill_areas_id_fk" FOREIGN KEY ("skill_area_id") REFERENCES "public"."skill_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_responses_position_key" ON "practice_responses" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "practice_responses_session_idx" ON "practice_responses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "practice_sessions_user_idx" ON "practice_sessions" USING btree ("user_id","skill_area_id");--> statement-breakpoint
CREATE INDEX "practice_sessions_tenant_idx" ON "practice_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_check_questions_position_key" ON "skill_check_questions" USING btree ("check_id","position");--> statement-breakpoint
CREATE INDEX "skill_check_questions_check_idx" ON "skill_check_questions" USING btree ("check_id");--> statement-breakpoint
CREATE INDEX "skill_checks_user_idx" ON "skill_checks" USING btree ("user_id","skill_area_id");--> statement-breakpoint
CREATE INDEX "skill_checks_tenant_idx" ON "skill_checks" USING btree ("tenant_id");