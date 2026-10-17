CREATE TYPE "public"."inbound_mode" AS ENUM('AI', 'HUMAN');--> statement-breakpoint
ALTER TABLE "inbound_bindings" ALTER COLUMN "agent_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_bindings" ADD COLUMN "mode" "inbound_mode" DEFAULT 'AI' NOT NULL;