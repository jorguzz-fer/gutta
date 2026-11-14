-- Busca por palavra (ADR 0014): português, sem acento ("inflamacao" acha "inflamação").
-- unaccent é extensão confiável: o dono do banco cria, sem superusuário.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'cognuss_pt') THEN
    CREATE TEXT SEARCH CONFIGURATION cognuss_pt (COPY = portuguese);
    ALTER TEXT SEARCH CONFIGURATION cognuss_pt
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."material_origin" AS ENUM('professor', 'pessoal', 'colega', 'cognuss', 'internet');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('estudo', 'atividade', 'prova');--> statement-breakpoint
CREATE TABLE "material_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"material_id" uuid NOT NULL,
	"discipline_id" uuid,
	"lesson_id" uuid,
	"topic_id" uuid,
	"teacher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"material_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"type" "material_type" DEFAULT 'estudo' NOT NULL,
	"origin" "material_origin" DEFAULT 'professor' NOT NULL,
	"term_id" uuid,
	"favorite" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('cognuss_pt'::regconfig, coalesce(title, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_pages" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('cognuss_pt'::regconfig, coalesce(text, ''))) STORED;--> statement-breakpoint
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_topic_id_discipline_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discipline_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_teacher_id_discipline_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."discipline_teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_term_id_student_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."student_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_links_material_idx" ON "material_links" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "material_links_lesson_idx" ON "material_links" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "material_links_discipline_idx" ON "material_links" USING btree ("discipline_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_versions_uq" ON "material_versions" USING btree ("material_id","version");--> statement-breakpoint
CREATE INDEX "materials_owner_idx" ON "materials" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "materials_search_idx" ON "materials" USING gin ("search");--> statement-breakpoint
CREATE INDEX "file_pages_search_idx" ON "file_pages" USING gin ("search");