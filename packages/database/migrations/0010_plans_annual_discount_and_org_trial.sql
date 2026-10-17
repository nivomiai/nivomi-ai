ALTER TABLE "plans" ADD COLUMN "annual_discount_bps" integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;