ALTER TABLE "official_status_mirrors" ADD COLUMN "provider_id" bigint;--> statement-breakpoint
ALTER TABLE "official_status_mirrors" ADD CONSTRAINT "official_status_mirrors_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Best-effort backfill: link a mirror to a provider whose display name matches the mirror's name.
-- Mirrors that were seeded from providers in migration 0003 used the provider's `name` verbatim,
-- so this restores the association for them. Mirrors added after decoupling that don't share a
-- name remain unlinked (provider_id NULL) — admins can bind them manually.
UPDATE "official_status_mirrors" m
SET "provider_id" = p."id"
FROM "providers" p
WHERE m."provider_id" IS NULL
  AND m."name" = p."name";
