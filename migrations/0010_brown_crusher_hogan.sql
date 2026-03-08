CREATE TABLE "device_linking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"session_code" text NOT NULL,
	"payload" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_linking_sessions_session_code_unique" UNIQUE("session_code")
);
--> statement-breakpoint
ALTER TABLE "device_linking_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "encrypted_deks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"dek_type" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"key_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encrypted_deks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "key_recovery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "key_recovery_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"key_version" integer NOT NULL,
	"key_type" text NOT NULL,
	"device_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "e2ee_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "device_linking_sessions" ADD CONSTRAINT "device_linking_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_deks" ADD CONSTRAINT "encrypted_deks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_deks" ADD CONSTRAINT "encrypted_deks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_deks" ADD CONSTRAINT "encrypted_deks_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_recovery_events" ADD CONSTRAINT "key_recovery_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_linking_sessions_user_id_idx" ON "device_linking_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_linking_sessions_session_code_idx" ON "device_linking_sessions" USING btree ("session_code");--> statement-breakpoint
CREATE INDEX "device_linking_sessions_expires_at_idx" ON "device_linking_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "encrypted_deks_plan_owner_recipient_kv_type_idx" ON "encrypted_deks" USING btree ("plan_id","owner_id","recipient_id","key_version","dek_type");--> statement-breakpoint
CREATE INDEX "encrypted_deks_plan_id_idx" ON "encrypted_deks" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "encrypted_deks_owner_id_idx" ON "encrypted_deks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "encrypted_deks_recipient_id_idx" ON "encrypted_deks" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "key_recovery_events_user_id_idx" ON "key_recovery_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_keys_user_id_key_version_idx" ON "user_keys" USING btree ("user_id","key_version");--> statement-breakpoint
CREATE INDEX "user_keys_user_id_idx" ON "user_keys" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "mux_playback_id";--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "mux_asset_id";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "is_encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "device_linking_sessions" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "device_linking_sessions" AS PERMISSIVE FOR SELECT TO public USING ("device_linking_sessions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "device_linking_sessions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("device_linking_sessions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "device_linking_sessions" AS PERMISSIVE FOR UPDATE TO public USING ("device_linking_sessions"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("device_linking_sessions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "device_linking_sessions" AS PERMISSIVE FOR DELETE TO public USING ("device_linking_sessions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "encrypted_deks" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "encrypted_deks_owner" ON "encrypted_deks" AS PERMISSIVE FOR ALL TO public USING ("encrypted_deks"."owner_id" = current_setting('app.user_id', true)) WITH CHECK ("encrypted_deks"."owner_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "encrypted_deks_recipient_read" ON "encrypted_deks" AS PERMISSIVE FOR SELECT TO public USING ("encrypted_deks"."recipient_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "key_recovery_events" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "key_recovery_events_select" ON "key_recovery_events" AS PERMISSIVE FOR SELECT TO public USING ("key_recovery_events"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "key_recovery_events_insert" ON "key_recovery_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("key_recovery_events"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "user_keys" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "user_keys_select" ON "user_keys" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.user_id', true) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "user_keys_modify" ON "user_keys" AS PERMISSIVE FOR ALL TO public USING ("user_keys"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("user_keys"."user_id" = current_setting('app.user_id', true));