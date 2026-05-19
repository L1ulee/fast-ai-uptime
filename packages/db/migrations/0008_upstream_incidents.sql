-- Add feed_kind / feed_url to mirrors so non-statuspage.io sources can be supported via RSS/Atom.
ALTER TABLE "official_status_mirrors" ADD COLUMN "feed_kind" text NOT NULL DEFAULT 'statuspage_v2';
--> statement-breakpoint
ALTER TABLE "official_status_mirrors" ADD COLUMN "feed_url" text;
--> statement-breakpoint
-- Upstream incidents / maintenances pulled from the mirror's feed.
CREATE TABLE "official_upstream_incidents" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "mirror_id" bigint NOT NULL,
  "upstream_id" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'incident',
  "title" text NOT NULL,
  "status" text,
  "impact" text,
  "url" text,
  "started_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "last_update_body" text,
  "last_update_at" timestamp with time zone,
  "raw" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "official_upstream_incidents_mirror_id_upstream_id_unique" UNIQUE ("mirror_id", "upstream_id"),
  CONSTRAINT "official_upstream_incidents_mirror_id_fk" FOREIGN KEY ("mirror_id") REFERENCES "public"."official_status_mirrors"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "idx_upstream_incidents_mirror" ON "official_upstream_incidents" ("mirror_id", "started_at" DESC);
