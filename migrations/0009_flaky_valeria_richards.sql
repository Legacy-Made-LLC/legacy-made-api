ALTER TABLE "files" ADD COLUMN "parent_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "role" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_parent_file_id_files_id_fk" FOREIGN KEY ("parent_file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_parent_file_id_idx" ON "files" USING btree ("parent_file_id");