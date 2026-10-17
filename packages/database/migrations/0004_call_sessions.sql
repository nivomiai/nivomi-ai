CREATE TYPE "public"."call_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."conversation_outcome" AS ENUM('INTERESTED', 'NOT_INTERESTED', 'CALLBACK_REQUESTED', 'COMPLETED', 'OPTED_OUT', 'TRANSFERRED', 'INCOMPLETE');--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"direction" "call_direction" NOT NULL,
	"call_attempt_id" uuid,
	"caller_number_id" uuid,
	"agent_version_id" uuid,
	"from_e164" text NOT NULL,
	"to_e164" text NOT NULL,
	"provider" text NOT NULL,
	"provider_call_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"telephony_outcome" text,
	"conversation_outcome" "conversation_outcome",
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qualification" jsonb,
	"usage" jsonb DEFAULT '{"inputTokens":0,"outputTokens":0,"audioSeconds":0}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"caller_number_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"handoff_e164" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."organization_role";--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('INDV_USER', 'ORGANIZATION', 'CUSTOM_PLAN');--> statement-breakpoint
ALTER TABLE "organization_invitations" ALTER COLUMN "role" SET DATA TYPE "public"."organization_role" USING "role"::"public"."organization_role";--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "role" SET DATA TYPE "public"."organization_role" USING "role"::"public"."organization_role";--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_call_attempt_id_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_caller_number_id_caller_numbers_id_fk" FOREIGN KEY ("caller_number_id") REFERENCES "public"."caller_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_bindings" ADD CONSTRAINT "inbound_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_bindings" ADD CONSTRAINT "inbound_bindings_caller_number_id_caller_numbers_id_fk" FOREIGN KEY ("caller_number_id") REFERENCES "public"."caller_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_bindings" ADD CONSTRAINT "inbound_bindings_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_sessions_org_started_idx" ON "call_sessions" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "call_sessions_org_direction_idx" ON "call_sessions" USING btree ("organization_id","direction","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "call_sessions_provider_call_uq" ON "call_sessions" USING btree ("provider","provider_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_bindings_number_uq" ON "inbound_bindings" USING btree ("caller_number_id");