CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"title" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata_schema" jsonb,
	"modified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_activity_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trusted_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"relationship" text,
	"access_level" text NOT NULL,
	"access_timing" text NOT NULL,
	"access_status" text DEFAULT 'pending' NOT NULL,
	"clerk_user_id" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trusted_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "modified_by" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "modified_by" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activity_log" ADD CONSTRAINT "plan_activity_log_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activity_log" ADD CONSTRAINT "plan_activity_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contacts" ADD CONSTRAINT "trusted_contacts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contacts" ADD CONSTRAINT "trusted_contacts_clerk_user_id_users_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_plan_id_idx" ON "messages" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "messages_task_key_idx" ON "messages" USING btree ("plan_id","task_key");--> statement-breakpoint
CREATE INDEX "plan_activity_log_plan_id_idx" ON "plan_activity_log" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_activity_log_actor_user_id_idx" ON "plan_activity_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "plan_activity_log_resource_idx" ON "plan_activity_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "trusted_contacts_plan_id_idx" ON "trusted_contacts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "trusted_contacts_clerk_user_id_idx" ON "trusted_contacts" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "trusted_contacts_email_idx" ON "trusted_contacts" USING btree ("email");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_message_id_idx" ON "files" USING btree ("message_id");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "messages" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "messages" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "messages" AS PERMISSIVE FOR UPDATE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "messages" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "plan_activity_log" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "plan_activity_log" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "plan_activity_log"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "plan_activity_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "plan_activity_log"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "plan_activity_log" AS PERMISSIVE FOR UPDATE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "plan_activity_log"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "plan_activity_log"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "plan_activity_log" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "plan_activity_log"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "trusted_contacts" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "trusted_contacts" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "trusted_contacts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "trusted_contacts" AS PERMISSIVE FOR UPDATE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "trusted_contacts" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
ALTER POLICY "crud-public-policy-select" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "files" TO public WITH CHECK (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
      ) WITH CHECK (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND p.user_id = current_setting('app.user_id', true)
          )
        )
      );