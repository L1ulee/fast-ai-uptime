CREATE TYPE "public"."announcement_level" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('ok', 'degraded', 'down', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."endpoint_type" AS ENUM('chat', 'responses', 'embedding', 'ping');--> statement-breakpoint
CREATE TYPE "public"."error_kind" AS ENUM('auth', 'rate_limit', 'server_error', 'network', 'timeout', 'invalid_response');--> statement-breakpoint
CREATE TYPE "public"."incident_impact" AS ENUM('none', 'minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."provider_type" AS ENUM('openai', 'anthropic', 'gemini', 'custom');--> statement-breakpoint
CREATE TYPE "public"."subscription_channel" AS ENUM('email', 'webhook', 'slack', 'discord');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"body_md" text NOT NULL,
	"level" "announcement_level" DEFAULT 'info' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text DEFAULT 'admin' NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"payload" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_configs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint,
	"model_id" bigint NOT NULL,
	"display_name" text NOT NULL,
	"endpoint" text NOT NULL,
	"endpoint_type" "endpoint_type" NOT NULL,
	"api_key_enc" text,
	"request_body" jsonb,
	"headers" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_maintenance" boolean DEFAULT false NOT NULL,
	"poll_interval_seconds" integer DEFAULT 60 NOT NULL,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"config_id" bigint NOT NULL,
	"status" "check_status" NOT NULL,
	"latency_ms" integer,
	"ping_ms" integer,
	"http_status" integer,
	"error_kind" "error_kind",
	"error_message" text,
	"region" text DEFAULT 'default' NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_results_5min" (
	"config_id" bigint NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"ok_count" integer DEFAULT 0 NOT NULL,
	"degraded_count" integer DEFAULT 0 NOT NULL,
	"down_count" integer DEFAULT 0 NOT NULL,
	"p50_ms" integer,
	"p95_ms" integer,
	"p99_ms" integer,
	CONSTRAINT "check_results_5min_config_id_bucket_at_pk" PRIMARY KEY("config_id","bucket_at")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"homepage" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "incident_components" (
	"incident_id" bigint NOT NULL,
	"config_id" bigint NOT NULL,
	CONSTRAINT "incident_components_incident_id_config_id_pk" PRIMARY KEY("incident_id","config_id")
);
--> statement-breakpoint
CREATE TABLE "incident_updates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"incident_id" bigint NOT NULL,
	"status" "incident_status" NOT NULL,
	"body_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"impact" "incident_impact" DEFAULT 'minor' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_components" (
	"maintenance_id" bigint NOT NULL,
	"config_id" bigint NOT NULL,
	CONSTRAINT "maintenance_components_maintenance_id_config_id_pk" PRIMARY KEY("maintenance_id","config_id")
);
--> statement-breakpoint
CREATE TABLE "maintenances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body_md" text,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"status" "maintenance_status" DEFAULT 'scheduled' NOT NULL,
	"notify_lead_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider_id" bigint NOT NULL,
	"model_name" text NOT NULL,
	"capability" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_providerId_modelName_unique" UNIQUE("provider_id","model_name")
);
--> statement-breakpoint
CREATE TABLE "official_status_snapshots" (
	"provider_id" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"overall_status" text,
	"raw_payload" jsonb,
	CONSTRAINT "official_status_snapshots_provider_id_fetched_at_pk" PRIMARY KEY("provider_id","fetched_at")
);
--> statement-breakpoint
CREATE TABLE "probe_leases" (
	"lease_key" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "provider_type" NOT NULL,
	"name" text NOT NULL,
	"homepage" text,
	"status_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_type_name_unique" UNIQUE("type","name")
);
--> statement-breakpoint
CREATE TABLE "subscription_components" (
	"subscription_id" bigint NOT NULL,
	"config_id" bigint NOT NULL,
	CONSTRAINT "subscription_components_subscription_id_config_id_pk" PRIMARY KEY("subscription_id","config_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" "subscription_channel" NOT NULL,
	"target" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"unsub_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_unsubToken_unique" UNIQUE("unsub_token")
);
--> statement-breakpoint
ALTER TABLE "check_configs" ADD CONSTRAINT "check_configs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_configs" ADD CONSTRAINT "check_configs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_config_id_check_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results_5min" ADD CONSTRAINT "check_results_5min_config_id_check_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_components" ADD CONSTRAINT "incident_components_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_components" ADD CONSTRAINT "incident_components_config_id_check_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_components" ADD CONSTRAINT "maintenance_components_maintenance_id_maintenances_id_fk" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_components" ADD CONSTRAINT "maintenance_components_config_id_check_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_status_snapshots" ADD CONSTRAINT "official_status_snapshots_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_components" ADD CONSTRAINT "subscription_components_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_components" ADD CONSTRAINT "subscription_components_config_id_check_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_announcements_active" ON "announcements" USING btree ("enabled","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_check_configs_group" ON "check_configs" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_check_configs_enabled" ON "check_configs" USING btree ("enabled","is_maintenance");--> statement-breakpoint
CREATE INDEX "idx_check_results_config_time" ON "check_results" USING btree ("config_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_check_results_checked_at" ON "check_results" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "idx_check_results_5min_bucket" ON "check_results_5min" USING btree ("bucket_at");--> statement-breakpoint
CREATE INDEX "idx_incident_updates_incident" ON "incident_updates" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_incidents_status" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_incidents_started" ON "incidents" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_maintenances_status" ON "maintenances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_maintenances_window" ON "maintenances" USING btree ("scheduled_start","scheduled_end");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_channel_target" ON "subscriptions" USING btree ("channel","target");