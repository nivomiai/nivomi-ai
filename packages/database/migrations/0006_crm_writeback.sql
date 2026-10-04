CREATE TYPE "public"."crm_sync_job_kind" AS ENUM('PUSH_LEAD_STATUS', 'PUSH_CALL_OUTCOME', 'PUSH_OPT_OUT', 'PUSH_APPOINTMENT');--> statement-breakpoint
CREATE TYPE "public"."crm_sync_job_status" AS ENUM('PENDING', 'DONE', 'DEAD_LETTER');--> statement-breakpoint
CREATE TABLE "crm_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "crm_sync_job_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"projection_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "crm_sync_job_status" DEFAULT 'PENDING' NOT NULL,
	"attempts_count" text DEFAULT '0' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"install_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"subscription_type" text NOT NULL,
	"raw_jsonb" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crm_sync_jobs" ADD CONSTRAINT "crm_sync_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_sync_jobs_dedupe_uq" ON "crm_sync_jobs" USING btree ("organization_id","kind","entity_id","projection_hash");--> statement-breakpoint
CREATE INDEX "crm_sync_jobs_pending_idx" ON "crm_sync_jobs" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_webhook_events_dedupe_uq" ON "crm_webhook_events" USING btree ("install_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "crm_webhook_events_install_idx" ON "crm_webhook_events" USING btree ("install_id","received_at");