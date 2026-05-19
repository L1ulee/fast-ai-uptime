ALTER TABLE "check_configs" ALTER COLUMN "endpoint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_configs" ADD COLUMN "endpoint_path" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "api_key_enc" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;