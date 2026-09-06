ALTER TABLE "employers" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employer_id" uuid;--> statement-breakpoint
ALTER TABLE "employers" ADD CONSTRAINT "employers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employers_tenant_key" ON "employers" USING btree ("tenant_id");