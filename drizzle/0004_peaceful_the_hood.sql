CREATE TYPE "public"."roster_invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "roster_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"roll_number" text,
	"branch" text,
	"section" text,
	"batch_year" integer,
	"token_hash" text NOT NULL,
	"status" "roster_invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"accepted_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster_invitations" ADD CONSTRAINT "roster_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_invitations" ADD CONSTRAINT "roster_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_invitations" ADD CONSTRAINT "roster_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_invitations_tenant_email_key" ON "roster_invitations" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_invitations_token_hash_key" ON "roster_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "roster_invitations_tenant_status_idx" ON "roster_invitations" USING btree ("tenant_id","status");