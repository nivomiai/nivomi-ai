CREATE TYPE "public"."call_attempt_status" AS ENUM('DIALING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('CONNECTED', 'NO_ANSWER', 'BUSY', 'FAILED', 'PROVIDER_ERROR', 'OPTED_OUT', 'NOT_INTERESTED', 'WRONG_NUMBER');--> statement-breakpoint
CREATE TYPE "public"."campaign_lead_state" AS ENUM('PENDING', 'QUEUED', 'IN_CALL', 'WAITING', 'BLOCKED', 'REVIEW', 'EXCLUDED', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'STOPPED');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('STATIC', 'CONTINUOUS');--> statement-breakpoint
CREATE TYPE "public"."eligibility_purpose" AS ENUM('PRE_LAUNCH', 'DIAL');--> statement-breakpoint
CREATE TYPE "public"."eligibility_result" AS ENUM('ELIGIBLE', 'BLOCKED', 'DEFERRED', 'REQUIRES_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."eligibility_review_status" AS ENUM('OPEN', 'RESOLVED', 'EXCLUDED');--> statement-breakpoint
CREATE TYPE "public"."business_sector" AS ENUM('BFSI', 'REAL_ESTATE', 'EDUCATION', 'HEALTH', 'CONSUMER_GOODS_AUTOMOBILES', 'COMMUNICATION_IT_ENTERTAINMENT', 'TOURISM_LEISURE', 'FOOD_BEVERAGES', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."call_category" AS ENUM('PROMOTIONAL', 'SERVICE', 'TRANSACTIONAL');--> statement-breakpoint
CREATE TYPE "public"."caller_number_purpose" AS ENUM('PROMOTIONAL', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."caller_number_status" AS ENUM('ACTIVE', 'PAUSED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."complaint_kind" AS ENUM('COMPLAINT', 'OPERATOR_FLAG');--> statement-breakpoint
CREATE TYPE "public"."consent_entry_kind" AS ENUM('GRANT', 'REVOCATION');--> statement-breakpoint
CREATE TYPE "public"."rule_set_status" AS ENUM('DRAFT', 'APPROVED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."telecom_identity_status" AS ENUM('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "call_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"campaign_lead_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"decision_id" uuid NOT NULL,
	"caller_number_id" uuid,
	"to_phone_e164" text NOT NULL,
	"status" "call_attempt_status" DEFAULT 'DIALING' NOT NULL,
	"outcome" "call_outcome",
	"provider" text NOT NULL,
	"provider_call_id" text,
	"dial_requested_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"state" "campaign_lead_state" DEFAULT 'PENDING' NOT NULL,
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"dial_token" uuid,
	"last_result" "eligibility_result",
	"last_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_outcome" "call_outcome",
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"type" "campaign_type" NOT NULL,
	"call_category" "call_category" NOT NULL,
	"caller_number_id" uuid,
	"selection" jsonb NOT NULL,
	"window_start" text NOT NULL,
	"window_end" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_concurrent_calls" integer NOT NULL,
	"max_calls_per_hour" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"retry_interval_minutes" integer NOT NULL,
	"max_attempts_per_day" integer NOT NULL,
	"budget_minutes" integer NOT NULL,
	"used_seconds" integer DEFAULT 0 NOT NULL,
	"pause_reason" text,
	"prelaunch" jsonb,
	"tick_token" uuid,
	"launched_at" timestamp with time zone,
	"launched_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"campaign_id" uuid,
	"purpose" "eligibility_purpose" NOT NULL,
	"result" "eligibility_result" NOT NULL,
	"reasons" jsonb NOT NULL,
	"rule_set_id" uuid,
	"rule_set_version" integer,
	"jurisdiction" text,
	"inputs" jsonb NOT NULL,
	"next_eligible_at" timestamp with time zone,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"campaign_lead_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" "eligibility_review_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"resolution_note" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caller_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"series" text NOT NULL,
	"purpose" "caller_number_purpose" NOT NULL,
	"a2p_declared" boolean DEFAULT false NOT NULL,
	"status" "caller_number_status" DEFAULT 'ACTIVE' NOT NULL,
	"status_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "complaint_kind" NOT NULL,
	"caller_number_id" uuid,
	"lead_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"reference" text,
	"note" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"version" integer NOT NULL,
	"status" "rule_set_status" NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"rules" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"review_note" text,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpdp_consent_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid,
	"kind" "consent_entry_kind" NOT NULL,
	"purpose" text NOT NULL,
	"notice_version" text,
	"evidence" jsonb,
	"valid_from" timestamp with time zone,
	"source" text NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"event_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_calling_controls" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"default_jurisdiction" text DEFAULT 'IN' NOT NULL,
	"emergency_stop_active" boolean DEFAULT false NOT NULL,
	"emergency_stopped_at" timestamp with time zone,
	"emergency_stopped_by_user_id" uuid,
	"emergency_stop_reason" text,
	"breaker_tripped_at" timestamp with time zone,
	"breaker_reason" text,
	"breaker_acknowledged_at" timestamp with time zone,
	"breaker_acknowledged_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telecom_consent_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid,
	"phone_e164" text NOT NULL,
	"kind" "consent_entry_kind" NOT NULL,
	"basis" "consent_basis",
	"evidence" jsonb,
	"valid_from" timestamp with time zone,
	"source" text NOT NULL,
	"recipient_initiated" boolean DEFAULT false NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"event_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telecom_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "telecom_identity_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"legal_name" text,
	"dlt_entity_id" text,
	"telemarketer_name" text,
	"telemarketer_registration_id" text,
	"sector" "business_sector",
	"a2p_declaration_reference" text,
	"a2p_declared_at" timestamp with time zone,
	"self_certified_at" timestamp with time zone,
	"status_reason" text,
	"submitted_at" timestamp with time zone,
	"submitted_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_campaign_lead_id_campaign_leads_id_fk" FOREIGN KEY ("campaign_lead_id") REFERENCES "public"."campaign_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_decision_id_eligibility_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."eligibility_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_caller_number_id_caller_numbers_id_fk" FOREIGN KEY ("caller_number_id") REFERENCES "public"."caller_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_caller_number_id_caller_numbers_id_fk" FOREIGN KEY ("caller_number_id") REFERENCES "public"."caller_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_launched_by_user_id_users_id_fk" FOREIGN KEY ("launched_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_decisions" ADD CONSTRAINT "eligibility_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_decisions" ADD CONSTRAINT "eligibility_decisions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_decisions" ADD CONSTRAINT "eligibility_decisions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_decisions" ADD CONSTRAINT "eligibility_decisions_rule_set_id_compliance_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."compliance_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_reviews" ADD CONSTRAINT "eligibility_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_reviews" ADD CONSTRAINT "eligibility_reviews_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_reviews" ADD CONSTRAINT "eligibility_reviews_campaign_lead_id_campaign_leads_id_fk" FOREIGN KEY ("campaign_lead_id") REFERENCES "public"."campaign_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_reviews" ADD CONSTRAINT "eligibility_reviews_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_reviews" ADD CONSTRAINT "eligibility_reviews_decision_id_eligibility_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."eligibility_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caller_numbers" ADD CONSTRAINT "caller_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caller_numbers" ADD CONSTRAINT "caller_numbers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_records" ADD CONSTRAINT "complaint_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_records" ADD CONSTRAINT "complaint_records_caller_number_id_caller_numbers_id_fk" FOREIGN KEY ("caller_number_id") REFERENCES "public"."caller_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_records" ADD CONSTRAINT "complaint_records_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpdp_consent_entries" ADD CONSTRAINT "dpdp_consent_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpdp_consent_entries" ADD CONSTRAINT "dpdp_consent_entries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpdp_consent_entries" ADD CONSTRAINT "dpdp_consent_entries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_calling_controls" ADD CONSTRAINT "organization_calling_controls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_consent_entries" ADD CONSTRAINT "telecom_consent_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_consent_entries" ADD CONSTRAINT "telecom_consent_entries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_consent_entries" ADD CONSTRAINT "telecom_consent_entries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_identities" ADD CONSTRAINT "telecom_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_identities" ADD CONSTRAINT "telecom_identities_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_identities" ADD CONSTRAINT "telecom_identities_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_attempts_attempt_uq" ON "call_attempts" USING btree ("campaign_id","lead_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "call_attempts_provider_call_uq" ON "call_attempts" USING btree ("provider","provider_call_id");--> statement-breakpoint
CREATE INDEX "call_attempts_campaign_idx" ON "call_attempts" USING btree ("campaign_id","status","created_at");--> statement-breakpoint
CREATE INDEX "call_attempts_lead_idx" ON "call_attempts" USING btree ("organization_id","lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_leads_campaign_lead_uq" ON "campaign_leads" USING btree ("campaign_id","lead_id");--> statement-breakpoint
CREATE INDEX "campaign_leads_due_idx" ON "campaign_leads" USING btree ("campaign_id","state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "campaign_leads_lead_idx" ON "campaign_leads" USING btree ("organization_id","lead_id");--> statement-breakpoint
CREATE INDEX "campaigns_org_created_idx" ON "campaigns" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaigns_org_status_idx" ON "campaigns" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "eligibility_decisions_lead_idx" ON "eligibility_decisions" USING btree ("organization_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "eligibility_decisions_campaign_idx" ON "eligibility_decisions" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_reviews_open_uq" ON "eligibility_reviews" USING btree ("campaign_lead_id") WHERE "eligibility_reviews"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "eligibility_reviews_org_status_idx" ON "eligibility_reviews" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "caller_numbers_phone_uq" ON "caller_numbers" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "caller_numbers_org_idx" ON "caller_numbers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "complaint_records_org_received_idx" ON "complaint_records" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "complaint_records_org_created_idx" ON "complaint_records" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_rule_sets_version_uq" ON "compliance_rule_sets" USING btree ("jurisdiction","version");--> statement-breakpoint
CREATE UNIQUE INDEX "dpdp_consent_event_uq" ON "dpdp_consent_entries" USING btree ("organization_id","event_key");--> statement-breakpoint
CREATE INDEX "dpdp_consent_contact_idx" ON "dpdp_consent_entries" USING btree ("organization_id","contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telecom_consent_event_uq" ON "telecom_consent_entries" USING btree ("organization_id","event_key");--> statement-breakpoint
CREATE INDEX "telecom_consent_phone_idx" ON "telecom_consent_entries" USING btree ("organization_id","phone_e164","created_at");--> statement-breakpoint
CREATE INDEX "telecom_consent_contact_idx" ON "telecom_consent_entries" USING btree ("organization_id","contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telecom_identities_org_uq" ON "telecom_identities" USING btree ("organization_id");--> statement-breakpoint
-- Hand-written (ADR-021): consent ledgers and eligibility decisions are append-only.
CREATE FUNCTION "nivomi_reject_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "telecom_consent_entries_append_only" BEFORE UPDATE ON "telecom_consent_entries" FOR EACH ROW EXECUTE FUNCTION "nivomi_reject_update"();--> statement-breakpoint
CREATE TRIGGER "dpdp_consent_entries_append_only" BEFORE UPDATE ON "dpdp_consent_entries" FOR EACH ROW EXECUTE FUNCTION "nivomi_reject_update"();--> statement-breakpoint
CREATE TRIGGER "eligibility_decisions_append_only" BEFORE UPDATE ON "eligibility_decisions" FOR EACH ROW EXECUTE FUNCTION "nivomi_reject_update"();--> statement-breakpoint
-- Hand-written (ADR-021 §4): every existing consent basis becomes a telecom ledger GRANT.
INSERT INTO "telecom_consent_entries" ("organization_id", "contact_id", "lead_id", "phone_e164", "kind", "basis", "evidence", "valid_from", "source", "event_key")
SELECT l."organization_id", l."contact_id", l."id", c."phone_e164", 'GRANT', l."consent_basis", l."consent_evidence",
       CASE WHEN l."consent_evidence"->>'at' IS NULL THEN NULL ELSE (l."consent_evidence"->>'at')::timestamptz END,
       'BACKFILL', 'backfill:' || l."id"
FROM "leads" l JOIN "contacts" c ON c."id" = l."contact_id"
WHERE l."consent_basis" IS NOT NULL AND c."phone_e164" IS NOT NULL;
