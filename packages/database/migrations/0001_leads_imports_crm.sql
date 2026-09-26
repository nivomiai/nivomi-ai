CREATE TYPE "public"."crm_connection_status" AS ENUM('CONNECTED', 'DEGRADED', 'TOKEN_INVALID', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."crm_sync_run_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('AWAITING_UPLOAD', 'ANALYZING', 'MAPPING_REQUIRED', 'PREVIEWING', 'READY', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."consent_basis" AS ENUM('INQUIRY', 'APPLICATION', 'REGISTERED_CONSENT', 'EXISTING_CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('FILE_IMPORT', 'HUBSPOT', 'MANUAL', 'INBOUND');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'CONTACTED', 'ATTEMPTED', 'CONNECTED', 'INTERESTED', 'QUALIFIED', 'CALLBACK_REQUESTED', 'FOLLOW_UP', 'APPOINTMENT_BOOKED', 'CONVERTED', 'NOT_INTERESTED', 'UNREACHABLE', 'DO_NOT_CALL', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."review_item_status" AS ENUM('OPEN', 'RESOLVED_CREATED', 'RESOLVED_UPDATED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."status_change_source" AS ENUM('AI_CALL', 'MEMBER', 'IMPORT', 'HUBSPOT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."suppression_source" AS ENUM('MANUAL', 'IMPORT', 'IN_CALL_OPT_OUT', 'HUBSPOT');--> statement-breakpoint
CREATE TABLE "crm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"external_account_domain" text,
	"status" "crm_connection_status" NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_watermark" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"connected_by_user_id" uuid,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"status" "crm_sync_run_status" DEFAULT 'QUEUED' NOT NULL,
	"cursor" jsonb,
	"counts" jsonb DEFAULT '{"fetched":0,"created":0,"updated":0,"skipped":0,"review":0,"failed":0}'::jsonb NOT NULL,
	"error" text,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" "import_job_status" DEFAULT 'AWAITING_UPLOAD' NOT NULL,
	"headers" jsonb,
	"suggested_mapping" jsonb,
	"mapping" jsonb,
	"options" jsonb,
	"preview" jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"succeeded_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"review_rows" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"import_job_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"cells" jsonb NOT NULL,
	"outcome" text,
	"error" text,
	CONSTRAINT "import_rows_import_job_id_row_number_pk" PRIMARY KEY("import_job_id","row_number")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"full_name" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"phone_e164" text,
	"company_id" uuid,
	"job_title" text,
	"city" text,
	"state" text,
	"country" text,
	"preferred_language" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_record_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"external_object_type" text NOT NULL,
	"external_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" "data_source" NOT NULL,
	"source_reference" text,
	"record" jsonb NOT NULL,
	"candidate_contact_ids" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" "review_item_status" DEFAULT 'OPEN' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"source" "status_change_source" NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"event_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"source" "data_source" NOT NULL,
	"owner_user_id" uuid,
	"consent_basis" "consent_basis",
	"consent_evidence" jsonb,
	"score" text,
	"crm_details" jsonb,
	"member_status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"source" "data_source" NOT NULL,
	"source_reference" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"source" "suppression_source" NOT NULL,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_runs" ADD CONSTRAINT "crm_sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_runs" ADD CONSTRAINT "crm_sync_runs_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_record_links" ADD CONSTRAINT "external_record_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_review_items" ADD CONSTRAINT "ingestion_review_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_history" ADD CONSTRAINT "record_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_connections_org_provider_uq" ON "crm_connections" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_connections_active_account_uq" ON "crm_connections" USING btree ("provider","external_account_id") WHERE "crm_connections"."status" <> 'DISCONNECTED';--> statement-breakpoint
CREATE INDEX "crm_sync_runs_connection_idx" ON "crm_sync_runs" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_sync_runs_active_uq" ON "crm_sync_runs" USING btree ("connection_id") WHERE "crm_sync_runs"."status" in ('QUEUED', 'RUNNING');--> statement-breakpoint
CREATE INDEX "import_jobs_org_created_idx" ON "import_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_org_name_uq" ON "companies" USING btree ("organization_id","name_normalized");--> statement-breakpoint
CREATE INDEX "contacts_org_phone_idx" ON "contacts" USING btree ("organization_id","phone_e164");--> statement-breakpoint
CREATE INDEX "contacts_org_email_idx" ON "contacts" USING btree ("organization_id","email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "external_links_identity_uq" ON "external_record_links" USING btree ("organization_id","provider","external_account_id","external_object_type","external_id");--> statement-breakpoint
CREATE INDEX "external_links_entity_idx" ON "external_record_links" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "review_items_org_status_idx" ON "ingestion_review_items" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_status_changes_event_uq" ON "lead_status_changes" USING btree ("lead_id","event_key");--> statement-breakpoint
CREATE INDEX "lead_status_changes_lead_idx" ON "lead_status_changes" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_open_contact_uq" ON "leads" USING btree ("contact_id") WHERE "leads"."status" not in ('CONVERTED', 'CLOSED');--> statement-breakpoint
CREATE INDEX "leads_org_created_idx" ON "leads" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "leads_org_status_idx" ON "leads" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "leads_org_owner_idx" ON "leads" USING btree ("organization_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "record_history_entity_idx" ON "record_history" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_org_phone_uq" ON "suppression_entries" USING btree ("organization_id","phone_e164");