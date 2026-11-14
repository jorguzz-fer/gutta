CREATE TYPE "public"."tutor_scope" AS ENUM('materiais', 'aula', 'slide');--> statement-breakpoint
CREATE TABLE "tutor_thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"refused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_thread_messages_role_ck" CHECK ("tutor_thread_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "tutor_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"scope" "tutor_scope" NOT NULL,
	"title" text NOT NULL,
	"material_ids" uuid[] NOT NULL,
	"lesson_id" uuid,
	"focus_material_id" uuid,
	"focus_page" integer,
	"discipline_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutor_thread_messages" ADD CONSTRAINT "tutor_thread_messages_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_thread_messages" ADD CONSTRAINT "tutor_thread_messages_thread_id_tutor_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."tutor_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_threads" ADD CONSTRAINT "tutor_threads_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_threads" ADD CONSTRAINT "tutor_threads_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_thread_messages_idx" ON "tutor_thread_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "tutor_threads_owner_idx" ON "tutor_threads" USING btree ("owner_id","updated_at");