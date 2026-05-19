-- Unified system log feed (powers /admin/logs) + key/value app settings (powers /admin/settings).
CREATE TYPE "log_level" AS ENUM('debug', 'info', 'warn', 'error');
--> statement-breakpoint
CREATE TYPE "log_source" AS ENUM('audit', 'probe', 'webhook', 'system');
--> statement-breakpoint
CREATE TABLE "logs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "level" "log_level" DEFAULT 'info' NOT NULL,
  "source" "log_source" DEFAULT 'system' NOT NULL,
  "actor" text DEFAULT 'system' NOT NULL,
  "action" text NOT NULL,
  "target" text,
  "message" text DEFAULT '' NOT NULL,
  "meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_logs_created" ON "logs" USING btree ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX "idx_logs_level" ON "logs" USING btree ("level");
--> statement-breakpoint
CREATE INDEX "idx_logs_source" ON "logs" USING btree ("source");
--> statement-breakpoint
CREATE TABLE "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
