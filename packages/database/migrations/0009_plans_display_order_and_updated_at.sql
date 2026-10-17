ALTER TABLE "plans" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;