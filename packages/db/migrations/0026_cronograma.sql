CREATE TYPE "public"."assessment_kind" AS ENUM('prova', 'atividade', 'entrega');--> statement-breakpoint
CREATE TYPE "public"."event_origin" AS ENUM('imported', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lesson_kind" AS ENUM('aula', 'pratica', 'outro');--> statement-breakpoint
CREATE TYPE "public"."schedule_import_status" AS ENUM('waiting_file', 'needs_consent', 'extracting', 'ready', 'confirmed', 'rejected', 'failed');--> statement-breakpoint
ALTER TYPE "public"."consent_purpose" ADD VALUE 'ai_materials';--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_id" text,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"kind" "assessment_kind" NOT NULL,
	"name" text NOT NULL,
	"due_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"weight" numeric(6, 2),
	"percent" numeric(5, 2),
	"max_grade" numeric(6, 2) DEFAULT '10' NOT NULL,
	"grade" numeric(6, 2),
	"topic_note" text,
	"origin" "event_origin" DEFAULT 'manual' NOT NULL,
	"original" jsonb,
	"modified_by_student" boolean DEFAULT false NOT NULL,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"kind" "lesson_kind" DEFAULT 'aula' NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"topic_id" uuid,
	"teacher_id" uuid,
	"location" text,
	"class_hours" numeric(4, 1),
	"origin" "event_origin" DEFAULT 'manual' NOT NULL,
	"original" jsonb,
	"modified_by_student" boolean DEFAULT false NOT NULL,
	"import_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_end_ck" CHECK ("lessons"."ends_at" is null or "lessons"."ends_at" > "lessons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "schedule_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"status" "schedule_import_status" DEFAULT 'waiting_file' NOT NULL,
	"extracted" jsonb,
	"confirmed" jsonb,
	"reference_year" smallint NOT NULL,
	"error" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_topic_id_discipline_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discipline_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_discipline_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."discipline_teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_imports" ADD CONSTRAINT "schedule_imports_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_imports" ADD CONSTRAINT "schedule_imports_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_imports" ADD CONSTRAINT "schedule_imports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_owner_idx" ON "ai_usage" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage" USING btree ("feature","created_at");--> statement-breakpoint
CREATE INDEX "assessments_owner_due_idx" ON "assessments" USING btree ("owner_id","due_at");--> statement-breakpoint
CREATE INDEX "assessments_discipline_idx" ON "assessments" USING btree ("discipline_id");--> statement-breakpoint
CREATE INDEX "lessons_owner_starts_idx" ON "lessons" USING btree ("owner_id","starts_at");--> statement-breakpoint
CREATE INDEX "lessons_discipline_idx" ON "lessons" USING btree ("discipline_id","starts_at");--> statement-breakpoint
CREATE INDEX "schedule_imports_owner_idx" ON "schedule_imports" USING btree ("owner_id","discipline_id","created_at");