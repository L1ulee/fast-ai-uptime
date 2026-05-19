-- Add `method` column (default 'POST', backfilled from endpoint_type heuristic).
ALTER TABLE "check_configs" ADD COLUMN "method" text NOT NULL DEFAULT 'POST';
--> statement-breakpoint
-- Backfill: ping endpoints became HEAD; everything else stays POST.
UPDATE "check_configs" SET "method" = 'HEAD' WHERE "endpoint_type" = 'ping';
--> statement-breakpoint
-- Drop the old column and its enum.
ALTER TABLE "check_configs" DROP COLUMN "endpoint_type";
--> statement-breakpoint
DROP TYPE "public"."endpoint_type";
