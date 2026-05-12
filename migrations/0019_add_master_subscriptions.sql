CREATE TABLE "master_subscription_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_subscription_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_member_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_subscription_audit_log_action_check" CHECK ("master_subscription_audit_log"."action" IN ('created', 'invited', 'invite_accepted', 'member_removed', 'status_changed', 'seats_changed', 'period_end_changed', 'lapsed'))
);
--> statement-breakpoint
ALTER TABLE "master_subscription_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "master_subscription_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_subscription_id" uuid NOT NULL,
	"user_id" text,
	"invited_email" text NOT NULL,
	"status" text DEFAULT 'pending_invite' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_subscription_members_status_check" CHECK ("master_subscription_members"."status" IN ('pending_invite', 'active', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "master_subscription_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "master_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"owner_consumes_seat" boolean DEFAULT true NOT NULL,
	"display_name" text NOT NULL,
	"tier" text DEFAULT 'individual' NOT NULL,
	"seat_limit" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_provider" text DEFAULT 'stripe_manual' NOT NULL,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_subscriptions_status_check" CHECK ("master_subscriptions"."status" IN ('active', 'past_due', 'suspended', 'cancelled')),
	CONSTRAINT "master_subscriptions_billing_provider_check" CHECK ("master_subscriptions"."billing_provider" IN ('stripe_manual', 'stripe')),
	CONSTRAINT "master_subscriptions_seat_limit_check" CHECK ("master_subscriptions"."seat_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "master_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_system_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "master_subscription_audit_log" ADD CONSTRAINT "master_subscription_audit_log_master_subscription_id_master_subscriptions_id_fk" FOREIGN KEY ("master_subscription_id") REFERENCES "public"."master_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscription_audit_log" ADD CONSTRAINT "master_subscription_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscription_audit_log" ADD CONSTRAINT "master_subscription_audit_log_target_member_id_master_subscription_members_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."master_subscription_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscription_members" ADD CONSTRAINT "master_subscription_members_master_subscription_id_master_subscriptions_id_fk" FOREIGN KEY ("master_subscription_id") REFERENCES "public"."master_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscription_members" ADD CONSTRAINT "master_subscription_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscription_members" ADD CONSTRAINT "master_subscription_members_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscriptions" ADD CONSTRAINT "master_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_subscriptions" ADD CONSTRAINT "master_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_subscription_audit_log_master_sub_id_idx" ON "master_subscription_audit_log" USING btree ("master_subscription_id");--> statement-breakpoint
CREATE INDEX "master_subscription_audit_log_created_at_idx" ON "master_subscription_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "master_subscription_members_sub_email_active_uniq" ON "master_subscription_members" USING btree ("master_subscription_id","invited_email") WHERE status <> 'removed';--> statement-breakpoint
CREATE INDEX "master_subscription_members_master_sub_id_idx" ON "master_subscription_members" USING btree ("master_subscription_id");--> statement-breakpoint
CREATE INDEX "master_subscription_members_user_id_idx" ON "master_subscription_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "master_subscription_members_invited_email_idx" ON "master_subscription_members" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "master_subscriptions_owner_user_id_idx" ON "master_subscriptions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "master_subscriptions_status_idx" ON "master_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "master_subscriptions_current_period_end_idx" ON "master_subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "master_subscription_audit_log" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "master_subscription_members" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "master_subscription_members_self_read" ON "master_subscription_members" AS PERMISSIVE FOR SELECT TO public USING ("master_subscription_members"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "master_subscription_members_owner_read" ON "master_subscription_members" AS PERMISSIVE FOR SELECT TO public USING (
        EXISTS (
          SELECT 1 FROM master_subscriptions
          WHERE master_subscriptions.id = "master_subscription_members"."master_subscription_id"
            AND master_subscriptions.owner_user_id = current_setting('app.user_id', true)
        )
      );--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "master_subscriptions" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "master_subscriptions_owner_read" ON "master_subscriptions" AS PERMISSIVE FOR SELECT TO public USING ("master_subscriptions"."owner_user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "master_subscriptions_member_read" ON "master_subscriptions" AS PERMISSIVE FOR SELECT TO public USING (
        EXISTS (
          SELECT 1 FROM master_subscription_members
          WHERE master_subscription_members.master_subscription_id = "master_subscriptions"."id"
            AND master_subscription_members.user_id = current_setting('app.user_id', true)
            AND master_subscription_members.status = 'active'
        )
      );