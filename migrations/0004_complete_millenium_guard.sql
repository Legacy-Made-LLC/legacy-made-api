CREATE TABLE "progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"key" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "progress_plan_id_key_idx" ON "progress" USING btree ("plan_id","key");--> statement-breakpoint
CREATE INDEX "progress_plan_id_idx" ON "progress" USING btree ("plan_id");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "progress" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "progress" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "progress" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "progress" AS PERMISSIVE FOR UPDATE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "progress" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);