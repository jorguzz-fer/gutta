CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."creation_level" AS ENUM('basico', 'intermediario', 'avancado');--> statement-breakpoint
CREATE TYPE "public"."creation_question_kind" AS ENUM('objetiva', 'discursiva');--> statement-breakpoint
CREATE TYPE "public"."creation_type" AS ENUM('resumo', 'flashcards', 'questoes', 'mapa', 'roteiro');--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"feature" text NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"result_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "creation_question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"chosen_index" smallint,
	"answer_text" text,
	"correct" boolean,
	"client_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creation_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"creation_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"kind" "creation_question_kind" NOT NULL,
	"stem" text NOT NULL,
	"options" text[] NOT NULL,
	"correct_index" smallint,
	"expected" text,
	"comment" text NOT NULL,
	"difficulty" text NOT NULL,
	"refs" text[] NOT NULL,
	CONSTRAINT "creation_questions_kind_ck" CHECK (("creation_questions"."kind" = 'objetiva' and "creation_questions"."correct_index" is not null and cardinality("creation_questions"."options") >= 2)
        or ("creation_questions"."kind" = 'discursiva' and "creation_questions"."expected" is not null))
);
--> statement-breakpoint
CREATE TABLE "creation_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"creation_id" uuid NOT NULL,
	"material_id" uuid,
	"version_id" uuid,
	"pages" integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"job_id" uuid,
	"type" "creation_type" NOT NULL,
	"level" "creation_level" NOT NULL,
	"style" text,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"discipline_id" uuid,
	"topic_id" uuid,
	"stale" boolean DEFAULT false NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"edited_at" timestamp with time zone,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "creation_id" uuid;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "enrolled_discipline_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_question_attempts" ADD CONSTRAINT "creation_question_attempts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_question_attempts" ADD CONSTRAINT "creation_question_attempts_question_id_creation_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."creation_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_questions" ADD CONSTRAINT "creation_questions_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_questions" ADD CONSTRAINT "creation_questions_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_sources" ADD CONSTRAINT "creation_sources_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_sources" ADD CONSTRAINT "creation_sources_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_sources" ADD CONSTRAINT "creation_sources_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_sources" ADD CONSTRAINT "creation_sources_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_topic_id_discipline_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discipline_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_owner_idx" ON "ai_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "creation_question_attempts_idx" ON "creation_question_attempts" USING btree ("question_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "creation_question_attempts_key_uq" ON "creation_question_attempts" USING btree ("owner_id","client_key") WHERE "creation_question_attempts"."client_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "creation_questions_position_uq" ON "creation_questions" USING btree ("creation_id","position");--> statement-breakpoint
CREATE INDEX "creation_sources_creation_idx" ON "creation_sources" USING btree ("creation_id");--> statement-breakpoint
CREATE INDEX "creations_owner_idx" ON "creations" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "creations_discipline_idx" ON "creations" USING btree ("discipline_id");--> statement-breakpoint
CREATE INDEX "flashcards_creation_idx" ON "flashcards" USING btree ("creation_id");