CREATE TYPE "public"."mastery_confidence" AS ENUM('insufficient', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."question_session_mode" AS ENUM('practice', 'diagnostic', 'daily');--> statement-breakpoint
CREATE TABLE "learning_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"topic_id" uuid,
	"type" text NOT NULL,
	"reason_code" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"algorithm_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"selected_option_id" uuid NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"duration_seconds" integer,
	"client_attempt_key" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"display_order" smallint NOT NULL,
	"body" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"explanation" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"mode" "question_session_mode" DEFAULT 'practice' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_count" smallint DEFAULT 5 NOT NULL,
	"algorithm_version" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"citation" text NOT NULL,
	"url" text,
	"accessed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"topic_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	"stem" text NOT NULL,
	"difficulty" smallint DEFAULT 2 NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"review_notes" text,
	"author_id" text,
	"reviewer_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_difficulty_chk" CHECK ("questions"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "topic_mastery" (
	"student_id" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"estimated_mastery" real,
	"confidence" "mastery_confidence" DEFAULT 'insufficient' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"algorithm_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_mastery_student_id_topic_id_pk" PRIMARY KEY("student_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "learning_recommendations" ADD CONSTRAINT "learning_recommendations_student_id_auth_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_recommendations" ADD CONSTRAINT "learning_recommendations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_session_id_question_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."question_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_student_id_auth_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sessions" ADD CONSTRAINT "question_sessions_student_id_auth_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewer_id_auth_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_mastery" ADD CONSTRAINT "topic_mastery_student_id_auth_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_mastery" ADD CONSTRAINT "topic_mastery_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_recommendations_student_idx" ON "learning_recommendations" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_idem_uq" ON "question_attempts" USING btree ("student_id","client_attempt_key");--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_once_per_session_uq" ON "question_attempts" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "question_attempts_student_idx" ON "question_attempts" USING btree ("student_id","answered_at");--> statement-breakpoint
CREATE INDEX "question_attempts_question_idx" ON "question_attempts" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_order_uq" ON "question_options" USING btree ("question_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_one_correct_uq" ON "question_options" USING btree ("question_id") WHERE "question_options"."is_correct";--> statement-breakpoint
CREATE INDEX "question_sessions_student_idx" ON "question_sessions" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE INDEX "question_sources_question_idx" ON "question_sources" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "questions_study_idx" ON "questions" USING btree ("status","topic_id","difficulty");--> statement-breakpoint
CREATE INDEX "questions_discipline_idx" ON "questions" USING btree ("discipline_id","status");--> statement-breakpoint
CREATE INDEX "questions_root_idx" ON "questions" USING btree ("root_id");