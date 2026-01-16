CREATE TYPE "public"."access_level" AS ENUM('full', 'limited', 'minimal');--> statement-breakpoint
CREATE TYPE "public"."entry_category" AS ENUM('contact', 'financial', 'insurance', 'legal_document', 'home', 'digital_access');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('personal', 'reflection', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('primary', 'secondary', 'backup');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"category" "entry_category" NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"priority" "priority",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"type" "message_type" DEFAULT 'personal' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"recipient_name" text,
	"milestone_date" timestamp with time zone,
	"milestone_description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'My Legacy Plan' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trusted_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"relationship" text,
	"access_level" "access_level" DEFAULT 'limited' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trusted_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "wishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contacts" ADD CONSTRAINT "trusted_contacts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_plan_id_idx" ON "entries" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "entries_category_idx" ON "entries" USING btree ("plan_id","category");--> statement-breakpoint
CREATE INDEX "messages_plan_id_idx" ON "messages" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "messages_type_idx" ON "messages" USING btree ("plan_id","type");--> statement-breakpoint
CREATE INDEX "plans_user_id_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trusted_contacts_plan_id_idx" ON "trusted_contacts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "wishes_plan_id_idx" ON "wishes" USING btree ("plan_id");--> statement-breakpoint
CREATE POLICY "entries_select_own" ON "entries" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "entries_insert_own" ON "entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "entries_update_own" ON "entries" AS PERMISSIVE FOR UPDATE TO public USING (
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
CREATE POLICY "entries_delete_own" ON "entries" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "messages_select_own" ON "messages" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "messages_insert_own" ON "messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "messages_update_own" ON "messages" AS PERMISSIVE FOR UPDATE TO public USING (
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
CREATE POLICY "messages_delete_own" ON "messages" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "plans_select_own" ON "plans" AS PERMISSIVE FOR SELECT TO public USING (
  "plans"."user_id" = current_setting('app.user_id', true)
);--> statement-breakpoint
CREATE POLICY "plans_insert_own" ON "plans" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  "plans"."user_id" = current_setting('app.user_id', true)
);--> statement-breakpoint
CREATE POLICY "plans_update_own" ON "plans" AS PERMISSIVE FOR UPDATE TO public USING (
  "plans"."user_id" = current_setting('app.user_id', true)
) WITH CHECK (
  "plans"."user_id" = current_setting('app.user_id', true)
);--> statement-breakpoint
CREATE POLICY "plans_delete_own" ON "plans" AS PERMISSIVE FOR DELETE TO public USING (
  "plans"."user_id" = current_setting('app.user_id', true)
);--> statement-breakpoint
CREATE POLICY "trusted_contacts_select_own" ON "trusted_contacts" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "trusted_contacts_insert_own" ON "trusted_contacts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "trusted_contacts_update_own" ON "trusted_contacts" AS PERMISSIVE FOR UPDATE TO public USING (
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
CREATE POLICY "trusted_contacts_delete_own" ON "trusted_contacts" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "trusted_contacts"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "users_select_own" ON "users" AS PERMISSIVE FOR SELECT TO public USING (
  "users"."id" = current_setting('app.user_id', true)
);--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users" AS PERMISSIVE FOR UPDATE TO public USING (
  "users"."id" = current_setting('app.user_id', true)
) WITH CHECK (
  "users"."id" = current_setting('app.user_id', true)
);--> statement-breakpoint
CREATE POLICY "wishes_select_own" ON "wishes" AS PERMISSIVE FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "wishes_insert_own" ON "wishes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);--> statement-breakpoint
CREATE POLICY "wishes_update_own" ON "wishes" AS PERMISSIVE FOR UPDATE TO public USING (
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
CREATE POLICY "wishes_delete_own" ON "wishes" AS PERMISSIVE FOR DELETE TO public USING (
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);