CREATE TYPE "public"."incident_source" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TABLE "incident_update_components" (
	"update_id" bigint NOT NULL,
	"config_id" bigint NOT NULL,
	CONSTRAINT "incident_update_components_update_id_config_id_pk" PRIMARY KEY("update_id","config_id")
);
--> statement-breakpoint
ALTER TABLE "incident_updates" ADD COLUMN "impact" "incident_impact" DEFAULT 'minor' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "source" "incident_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "auto_config_id" bigint;--> statement-breakpoint
ALTER TABLE "incident_update_components" ADD CONSTRAINT "incident_update_components_update_id_incident_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."incident_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_update_components" ADD CONSTRAINT "incident_update_components_config_id_check_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_auto_config_id_check_configs_id_fk" FOREIGN KEY ("auto_config_id") REFERENCES "public"."check_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_incidents_auto_config" ON "incidents" USING btree ("auto_config_id");
