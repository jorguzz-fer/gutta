CREATE TYPE "public"."discipline_document_kind" AS ENUM('cronograma', 'plano_ensino');--> statement-breakpoint
CREATE TABLE "discipline_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "discipline_document_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discipline_documents" ADD CONSTRAINT "discipline_documents_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_documents" ADD CONSTRAINT "discipline_documents_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_documents" ADD CONSTRAINT "discipline_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_documents_file_uq" ON "discipline_documents" USING btree ("discipline_id","kind","file_id");--> statement-breakpoint
CREATE INDEX "discipline_documents_owner_idx" ON "discipline_documents" USING btree ("owner_id");