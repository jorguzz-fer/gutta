CREATE TYPE "public"."production_asset_kind" AS ENUM('html', 'screenshot', 'image', 'clip', 'audio', 'video');--> statement-breakpoint
ALTER TYPE "public"."production_batch_status" ADD VALUE 'generating';--> statement-breakpoint
ALTER TYPE "public"."production_batch_status" ADD VALUE 'generated';--> statement-breakpoint
ALTER TYPE "public"."production_task_status" ADD VALUE 'generating';--> statement-breakpoint
ALTER TYPE "public"."production_task_status" ADD VALUE 'generated';--> statement-breakpoint
ALTER TYPE "public"."production_task_status" ADD VALUE 'failed';--> statement-breakpoint
CREATE TABLE "production_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" "production_asset_kind" NOT NULL,
	"version" integer NOT NULL,
	"provider" text NOT NULL,
	"external_job_id" text,
	"storage_key" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "current_version" integer;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "production_assets" ADD CONSTRAINT "production_assets_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_assets" ADD CONSTRAINT "production_assets_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_assets_task_idx" ON "production_assets" USING btree ("task_id","kind","version");