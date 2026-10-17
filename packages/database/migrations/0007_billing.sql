CREATE TYPE "public"."billing_cycle" AS ENUM('MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ISSUED', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."org_plan_status" AS ENUM('ACTIVE', 'CANCELLED', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."usage_event_kind" AS ENUM('CALL_MINUTES_OUTBOUND', 'CALL_MINUTES_INBOUND', 'STT_AUDIO_SECONDS', 'TTS_AUDIO_SECONDS', 'LLM_INPUT_TOKENS', 'LLM_OUTPUT_TOKENS', 'SMS_SENT', 'EMAILS_SENT', 'IMPORT_ROWS', 'CRM_API_CALLS');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_year_month" text NOT NULL,
	"line_items" jsonb NOT NULL,
	"subtotal_paise" bigint NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"pdf_s3_key" text,
	"provider_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"cycle" "billing_cycle" DEFAULT 'MONTHLY' NOT NULL,
	"status" "org_plan_status" DEFAULT 'ACTIVE' NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"monthly_paise_inr" bigint NOT NULL,
	"limits" jsonb NOT NULL,
	"overage_rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "plan_status" DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "usage_event_kind" NOT NULL,
	"quantity" bigint NOT NULL,
	"unit" text NOT NULL,
	"period_year_month" text NOT NULL,
	"source_id" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_plans" ADD CONSTRAINT "organization_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_plans" ADD CONSTRAINT "organization_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_period_uq" ON "invoices" USING btree ("organization_id","period_year_month");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_plans_active_uq" ON "organization_plans" USING btree ("organization_id") WHERE "organization_plans"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_uq" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "usage_events_org_period_kind_idx" ON "usage_events" USING btree ("organization_id","period_year_month","kind");--> statement-breakpoint
CREATE INDEX "usage_events_org_occurred_idx" ON "usage_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_source_uq" ON "usage_events" USING btree ("organization_id","kind","source_id") WHERE "usage_events"."source_id" IS NOT NULL;