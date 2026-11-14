CREATE TYPE "public"."plan_intensity" AS ENUM('leve', 'equilibrada', 'intensiva');--> statement-breakpoint
CREATE TYPE "public"."plan_priority" AS ENUM('bem_estar', 'avaliacoes', 'dificuldade', 'distribuicao');--> statement-breakpoint
CREATE TYPE "public"."preferred_period" AS ENUM('manha', 'tarde', 'noite', 'varia');--> statement-breakpoint
CREATE TYPE "public"."proposal_kind" AS ENUM('semana', 'replanejar');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'accepted', 'partly_accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('proposed', 'confirmed', 'done', 'partly_done', 'skipped', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."task_difficulty" AS ENUM('facil', 'moderado', 'dificil');--> statement-breakpoint
CREATE TYPE "public"."task_importance" AS ENUM('nenhuma', 'importante', 'alta');--> statement-breakpoint
CREATE TYPE "public"."task_origin" AS ENUM('aula', 'falta', 'prova', 'nota', 'aluno', 'memory');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pendente', 'concluida', 'adiada', 'descartada');--> statement-breakpoint
CREATE TABLE "plan_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"week_start" date NOT NULL,
	"kind" "proposal_kind" DEFAULT 'semana' NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"algorithm_version" text NOT NULL,
	"variant" smallint DEFAULT 0 NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"unplaced" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capacity" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"proposal_id" uuid,
	"task_id" uuid,
	"discipline_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "session_status" DEFAULT 'proposed' NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"part" smallint,
	"parts" smallint,
	"done_minutes" integer,
	"reschedule_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_end_ck" CHECK ("study_sessions"."ends_at" > "study_sessions"."starts_at"),
	CONSTRAINT "study_sessions_done_ck" CHECK ("study_sessions"."done_minutes" is null or "study_sessions"."done_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "study_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid,
	"topic_id" uuid,
	"lesson_id" uuid,
	"assessment_id" uuid,
	"title" text NOT NULL,
	"estimated_minutes" smallint NOT NULL,
	"done_minutes" smallint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"origin" "task_origin" DEFAULT 'aluno' NOT NULL,
	"difficulty" "task_difficulty",
	"importance" "task_importance",
	"status" "task_status" DEFAULT 'pendente' NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_tasks_minutes_ck" CHECK ("study_tasks"."estimated_minutes" between 5 and 1200),
	CONSTRAINT "study_tasks_done_ck" CHECK ("study_tasks"."done_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "preferred_period" "preferred_period" DEFAULT 'varia' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "session_minutes" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "intensity" "plan_intensity" DEFAULT 'equilibrada' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "priority" "plan_priority" DEFAULT 'bem_estar' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "daily_limit_minutes" smallint;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "weekly_limit_minutes" smallint;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "break_minutes" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "max_consecutive" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "long_break_minutes" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD COLUMN "avoid_after_long_journey" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_proposal_id_plan_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."plan_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_task_id_study_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."study_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_topic_id_discipline_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discipline_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_proposals_owner_idx" ON "plan_proposals" USING btree ("owner_id","week_start","created_at");--> statement-breakpoint
CREATE INDEX "study_sessions_owner_idx" ON "study_sessions" USING btree ("owner_id","starts_at");--> statement-breakpoint
CREATE INDEX "study_sessions_proposal_idx" ON "study_sessions" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "study_sessions_task_idx" ON "study_sessions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "study_tasks_owner_idx" ON "study_tasks" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "study_tasks_source_uq" ON "study_tasks" USING btree ("owner_id","source_ref") WHERE "study_tasks"."source_ref" is not null;--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD CONSTRAINT "planning_session_ck" CHECK ("planning_preferences"."session_minutes" in (20, 30, 45, 60));--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD CONSTRAINT "planning_break_ck" CHECK ("planning_preferences"."break_minutes" between 5 and 30);--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD CONSTRAINT "planning_consecutive_ck" CHECK ("planning_preferences"."max_consecutive" between 1 and 4);--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD CONSTRAINT "planning_long_break_ck" CHECK ("planning_preferences"."long_break_minutes" between 10 and 120);--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD CONSTRAINT "planning_limits_ck" CHECK (("planning_preferences"."daily_limit_minutes" is null or "planning_preferences"."daily_limit_minutes" between 0 and 1440)
        and ("planning_preferences"."weekly_limit_minutes" is null or "planning_preferences"."weekly_limit_minutes" between 0 and 6000));