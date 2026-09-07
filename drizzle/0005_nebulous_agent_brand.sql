CREATE TABLE "item_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid,
	"analysed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"urgent_count" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"ok_count" integer DEFAULT 0 NOT NULL,
	"response_count" integer DEFAULT 0 NOT NULL,
	"min_responses" integer NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"responses" integer NOT NULL,
	"facility" numeric(6, 4),
	"discrimination" numeric(6, 4),
	"discrimination_p" numeric(8, 6),
	"verdict" text NOT NULL,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"message" text NOT NULL,
	"distractors" jsonb
);
--> statement-breakpoint
ALTER TABLE "item_analysis_runs" ADD CONSTRAINT "item_analysis_runs_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_statistics" ADD CONSTRAINT "item_statistics_run_id_item_analysis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."item_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_statistics" ADD CONSTRAINT "item_statistics_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_statistics_run_question_key" ON "item_statistics" USING btree ("run_id","question_id");--> statement-breakpoint
CREATE INDEX "item_statistics_verdict_idx" ON "item_statistics" USING btree ("run_id","verdict");