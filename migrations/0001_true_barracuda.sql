CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"mux_playback_id" text,
	"mux_asset_id" text,
	"access_level" text DEFAULT 'private' NOT NULL,
	"share_token" text,
	"share_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_entry_id_idx" ON "files" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "files_share_token_idx" ON "files" USING btree ("share_token");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "files" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "files" AS PERMISSIVE FOR SELECT TO public USING (
        EXISTS (
          SELECT 1 FROM entries e
          JOIN plans p ON p.id = e.plan_id
          WHERE e.id = "files"."entry_id"
          AND p.user_id = current_setting('app.user_id', true)
        )
      );--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "files" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
        EXISTS (
          SELECT 1 FROM entries e
          JOIN plans p ON p.id = e.plan_id
          WHERE e.id = "files"."entry_id"
          AND p.user_id = current_setting('app.user_id', true)
        )
      );--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "files" AS PERMISSIVE FOR UPDATE TO public USING (
        EXISTS (
          SELECT 1 FROM entries e
          JOIN plans p ON p.id = e.plan_id
          WHERE e.id = "files"."entry_id"
          AND p.user_id = current_setting('app.user_id', true)
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM entries e
          JOIN plans p ON p.id = e.plan_id
          WHERE e.id = "files"."entry_id"
          AND p.user_id = current_setting('app.user_id', true)
        )
      );--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "files" AS PERMISSIVE FOR DELETE TO public USING (
        EXISTS (
          SELECT 1 FROM entries e
          JOIN plans p ON p.id = e.plan_id
          WHERE e.id = "files"."entry_id"
          AND p.user_id = current_setting('app.user_id', true)
        )
      );