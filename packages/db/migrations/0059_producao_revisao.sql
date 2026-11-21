CREATE TABLE "production_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reviewer_id" text,
	"decision" text NOT NULL,
	"excerpt" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "question_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "approved_version" integer;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "back_to_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "production_reviews" ADD CONSTRAINT "production_reviews_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reviews" ADD CONSTRAINT "production_reviews_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reviews" ADD CONSTRAINT "production_reviews_reviewer_id_auth_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_reviews_task_idx" ON "production_reviews" USING btree ("task_id","created_at");