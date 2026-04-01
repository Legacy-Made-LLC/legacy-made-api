CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"notifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_log_user_id_type_idx" ON "notification_log" USING btree ("user_id","type");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "notification_log" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "user_preferences" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "user_preferences" AS PERMISSIVE FOR SELECT TO public USING ("user_preferences"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "user_preferences" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("user_preferences"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "user_preferences" AS PERMISSIVE FOR UPDATE TO public USING ("user_preferences"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("user_preferences"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "user_preferences" AS PERMISSIVE FOR DELETE TO public USING ("user_preferences"."user_id" = current_setting('app.user_id', true));