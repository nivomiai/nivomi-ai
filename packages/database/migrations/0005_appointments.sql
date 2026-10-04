CREATE TYPE "public"."appointment_channel" AS ENUM('CALL', 'IN_PERSON', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."appointment_source" AS ENUM('AI_CALL', 'MANUAL', 'INBOUND', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');--> statement-breakpoint
CREATE TABLE "appointment_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"starts_at_minutes" integer NOT NULL,
	"ends_at_minutes" integer NOT NULL,
	"timezone" text NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_slots_day_check" CHECK ("appointment_slots"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "appointment_slots_range_check" CHECK ("appointment_slots"."starts_at_minutes" >= 0 AND "appointment_slots"."ends_at_minutes" <= 1440 AND "appointment_slots"."starts_at_minutes" < "appointment_slots"."ends_at_minutes")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid,
	"assignee_user_id" uuid,
	"call_session_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"channel" "appointment_channel" NOT NULL,
	"location_text" text,
	"notes" text,
	"status" "appointment_status" DEFAULT 'SCHEDULED' NOT NULL,
	"source" "appointment_source" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_duration_check" CHECK ("appointments"."duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_slots_user_idx" ON "appointment_slots" USING btree ("organization_id","user_id","day_of_week");--> statement-breakpoint
CREATE INDEX "appointments_org_time_idx" ON "appointments" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_assignee_idx" ON "appointments" USING btree ("organization_id","assignee_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_lead_idx" ON "appointments" USING btree ("organization_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_call_session_uq" ON "appointments" USING btree ("call_session_id") WHERE "appointments"."call_session_id" IS NOT NULL;