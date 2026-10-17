CREATE TABLE "user_welcome_surveys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text,
	"call_volume" text,
	"migrating_from" text,
	"referral_source" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_welcome_surveys" ADD CONSTRAINT "user_welcome_surveys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Accounts that existed before the welcome survey never see it.
INSERT INTO "user_welcome_surveys" ("user_id") SELECT "id" FROM "users" ON CONFLICT DO NOTHING;
