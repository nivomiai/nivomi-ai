CREATE TYPE "public"."mfa_method" AS ENUM('TOTP');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('OWNERS', 'ADMINS', 'ALL_MEMBERS', 'SPECIFIC_USER');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('EMAIL', 'SMS', 'IN_APP');--> statement-breakpoint
CREATE TYPE "public"."notification_dispatch_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "notification_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"locale_default" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"kind" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_dispatch_status" DEFAULT 'QUEUED' NOT NULL,
	"source_entity_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mfa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"method" "mfa_method" DEFAULT 'TOTP' NOT NULL,
	"secret_encrypted" text NOT NULL,
	"recovery_codes_encrypted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_definitions_kind_channel_uq" ON "notification_definitions" USING btree ("kind","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dispatches_dedupe_uq" ON "notification_dispatches" USING btree ("organization_id","kind","channel","recipient","source_entity_id");--> statement-breakpoint
CREATE INDEX "notification_dispatches_queue_idx" ON "notification_dispatches" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_uq" ON "notification_preferences" USING btree ("user_id","kind","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "user_mfa_user_uq" ON "user_mfa" USING btree ("user_id");