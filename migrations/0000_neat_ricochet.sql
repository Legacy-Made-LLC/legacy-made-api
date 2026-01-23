CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"title" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT current_setting('app.user_id', true) NOT NULL,
	"name" text DEFAULT 'My Legacy Plan' NOT NULL,
	"plan_type" text DEFAULT 'self' NOT NULL,
	"for_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_plan_id_idx" ON "entries" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "entries_category_idx" ON "entries" USING btree ("plan_id","task_key");--> statement-breakpoint
CREATE INDEX "plans_user_id_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "entries" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "entries" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "entries" AS PERMISSIVE FOR UPDATE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "entries" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "plans" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "plans" AS PERMISSIVE FOR SELECT TO public USING ("plans"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "plans" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("plans"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "plans" AS PERMISSIVE FOR UPDATE TO public USING ("plans"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("plans"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "plans" AS PERMISSIVE FOR DELETE TO public USING ("plans"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "users" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "users" AS PERMISSIVE FOR SELECT TO public USING ("users"."id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "users" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("users"."id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "users" AS PERMISSIVE FOR UPDATE TO public USING ("users"."id" = current_setting('app.user_id', true)) WITH CHECK ("users"."id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "users" AS PERMISSIVE FOR DELETE TO public USING ("users"."id" = current_setting('app.user_id', true));