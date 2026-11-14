CREATE TYPE "public"."lesson_difficulty" AS ENUM('facil', 'moderada', 'dificil');--> statement-breakpoint
CREATE TYPE "public"."mark_difficulty" AS ENUM('facil', 'moderado', 'dificil');--> statement-breakpoint
CREATE TYPE "public"."mark_importance" AS ENUM('nenhuma', 'importante', 'alta');--> statement-breakpoint
CREATE TYPE "public"."mark_target" AS ENUM('slide', 'regiao', 'anotacao', 'tema');--> statement-breakpoint
CREATE TABLE "content_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"target_type" "mark_target" NOT NULL,
	"lesson_id" uuid,
	"material_id" uuid,
	"version_id" uuid,
	"page" integer,
	"region" jsonb,
	"entry_id" uuid,
	"topic_id" uuid,
	"importance" "mark_importance" DEFAULT 'nenhuma' NOT NULL,
	"difficulty" "mark_difficulty",
	"doubt" text,
	"doubt_resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_marks_target_ck" CHECK (("content_marks"."target_type" = 'slide' AND "content_marks"."version_id" IS NOT NULL AND "content_marks"."page" IS NOT NULL)
        OR ("content_marks"."target_type" = 'regiao' AND "content_marks"."version_id" IS NOT NULL AND "content_marks"."page" IS NOT NULL AND "content_marks"."region" IS NOT NULL)
        OR ("content_marks"."target_type" = 'anotacao' AND "content_marks"."entry_id" IS NOT NULL)
        OR ("content_marks"."target_type" = 'tema' AND "content_marks"."topic_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"attended" boolean,
	"overall_difficulty" "lesson_difficulty",
	"understood_goals" boolean DEFAULT false NOT NULL,
	"has_doubts" boolean DEFAULT false NOT NULL,
	"wants_review" boolean DEFAULT false NOT NULL,
	"concluded_at" timestamp with time zone,
	"last_material_id" uuid,
	"last_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"lesson_id" uuid,
	"material_id" uuid,
	"version_id" uuid,
	"page" integer,
	"region" jsonb,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('cognuss_pt'::regconfig, coalesce(plain_text, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebook_entry_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slide_annotation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"annotation_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"layer" jsonb NOT NULL,
	"reason" text DEFAULT 'copia' NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slide_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"layer" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slide_annotations_page_ck" CHECK ("slide_annotations"."page" >= 1)
);
--> statement-breakpoint
ALTER TABLE "content_marks" ADD CONSTRAINT "content_marks_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_marks" ADD CONSTRAINT "content_marks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_marks" ADD CONSTRAINT "content_marks_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_marks" ADD CONSTRAINT "content_marks_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_marks" ADD CONSTRAINT "content_marks_entry_id_notebook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."notebook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_marks" ADD CONSTRAINT "content_marks_topic_id_discipline_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discipline_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_last_material_id_materials_id_fk" FOREIGN KEY ("last_material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entries" ADD CONSTRAINT "notebook_entries_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entries" ADD CONSTRAINT "notebook_entries_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entries" ADD CONSTRAINT "notebook_entries_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entries" ADD CONSTRAINT "notebook_entries_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entries" ADD CONSTRAINT "notebook_entries_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entry_history" ADD CONSTRAINT "notebook_entry_history_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_entry_history" ADD CONSTRAINT "notebook_entry_history_entry_id_notebook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."notebook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_annotation_history" ADD CONSTRAINT "slide_annotation_history_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_annotation_history" ADD CONSTRAINT "slide_annotation_history_annotation_id_slide_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."slide_annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_annotations" ADD CONSTRAINT "slide_annotations_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_annotations" ADD CONSTRAINT "slide_annotations_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_annotations" ADD CONSTRAINT "slide_annotations_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_marks_slide_uq" ON "content_marks" USING btree ("version_id","page") WHERE "content_marks"."target_type" = 'slide';--> statement-breakpoint
CREATE INDEX "content_marks_lesson_idx" ON "content_marks" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "content_marks_material_idx" ON "content_marks" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_lesson_uq" ON "lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "notebook_entries_lesson_idx" ON "notebook_entries" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "notebook_entries_discipline_idx" ON "notebook_entries" USING btree ("discipline_id","created_at");--> statement-breakpoint
CREATE INDEX "notebook_entries_version_idx" ON "notebook_entries" USING btree ("version_id","page");--> statement-breakpoint
CREATE INDEX "notebook_entries_search_idx" ON "notebook_entries" USING gin ("search");--> statement-breakpoint
CREATE INDEX "notebook_entry_history_idx" ON "notebook_entry_history" USING btree ("entry_id","saved_at");--> statement-breakpoint
CREATE INDEX "slide_annotation_history_idx" ON "slide_annotation_history" USING btree ("annotation_id","saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slide_annotations_page_uq" ON "slide_annotations" USING btree ("version_id","page");--> statement-breakpoint
CREATE INDEX "slide_annotations_material_idx" ON "slide_annotations" USING btree ("material_id");