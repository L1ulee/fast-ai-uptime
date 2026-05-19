CREATE TABLE "official_status_mirrors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status_url" text NOT NULL,
	"homepage" text,
	"sync_interval_seconds" integer DEFAULT 300 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "official_status_mirrors_status_url_unique" UNIQUE("status_url")
);
--> statement-breakpoint
INSERT INTO "official_status_mirrors" ("name", "status_url", "homepage", "created_at", "updated_at")
SELECT "name", "status_url", "homepage", now(), now()
FROM "providers"
WHERE "status_url" IS NOT NULL
ON CONFLICT ("status_url") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" ADD COLUMN "mirror_id" bigint;
--> statement-breakpoint
UPDATE "official_status_snapshots" s
SET "mirror_id" = m."id"
FROM "providers" p
JOIN "official_status_mirrors" m ON m."status_url" = p."status_url"
WHERE s."provider_id" = p."id";
--> statement-breakpoint
DELETE FROM "official_status_snapshots" WHERE "mirror_id" IS NULL;
--> statement-breakpoint
-- Deduplicate (mirror_id, fetched_at) pairs in case multiple providers shared
-- the same status_url and had snapshots at identical timestamps; without this
-- the new primary key would fail with a duplicate-key violation.
DELETE FROM "official_status_snapshots" s1
USING "official_status_snapshots" s2
WHERE s1.ctid < s2.ctid
  AND s1."mirror_id" = s2."mirror_id"
  AND s1."fetched_at" = s2."fetched_at";
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" ALTER COLUMN "mirror_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" DROP CONSTRAINT "official_status_snapshots_provider_id_providers_id_fk";
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" DROP CONSTRAINT "official_status_snapshots_provider_id_fetched_at_pk";
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" DROP COLUMN "provider_id";
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" ADD CONSTRAINT "official_status_snapshots_mirror_id_fetched_at_pk" PRIMARY KEY("mirror_id","fetched_at");
--> statement-breakpoint
ALTER TABLE "official_status_snapshots" ADD CONSTRAINT "official_status_snapshots_mirror_id_official_status_mirrors_id_fk" FOREIGN KEY ("mirror_id") REFERENCES "public"."official_status_mirrors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "providers" DROP COLUMN "status_url";
