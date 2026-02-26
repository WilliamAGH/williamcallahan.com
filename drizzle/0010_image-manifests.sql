CREATE TABLE "image_manifests" (
	"manifest_type" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"checksum" text,
	"updated_at" bigint NOT NULL
);
