CREATE TABLE "wishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"title" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata_schema" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "entry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "metadata_schema" jsonb;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "wish_id" uuid;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishes_plan_id_idx" ON "wishes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "wishes_task_key_idx" ON "wishes" USING btree ("plan_id","task_key");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_wish_id_wishes_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_wish_id_idx" ON "files" USING btree ("wish_id");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "wishes" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "wishes" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "wishes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "wishes" AS PERMISSIVE FOR UPDATE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "wishes" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
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
      );