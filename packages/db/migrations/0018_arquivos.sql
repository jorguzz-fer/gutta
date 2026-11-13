CREATE TYPE "public"."file_status" AS ENUM('uploading', 'scanning', 'processing', 'ready', 'failed', 'quarantined');--> statement-breakpoint
CREATE TABLE "file_pages" (
	"file_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"page" integer NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"has_thumbnail" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_pages_file_id_page_pk" PRIMARY KEY("file_id","page")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "file_status" DEFAULT 'uploading' NOT NULL,
	"kind" text,
	"page_count" integer,
	"has_pdf" boolean DEFAULT false NOT NULL,
	"error" text,
	"scanned_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_size_ck" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_sha_ck" CHECK ("files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "file_pages" ADD CONSTRAINT "file_pages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_pages" ADD CONSTRAINT "file_pages_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_pages_owner_idx" ON "file_pages" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "files_owner_sha_uq" ON "files" USING btree ("owner_id","sha256") WHERE "files"."status" not in ('failed', 'quarantined');