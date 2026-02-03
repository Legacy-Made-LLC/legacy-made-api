CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "subscriptions" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "subscriptions" AS PERMISSIVE FOR SELECT TO public USING ("subscriptions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "subscriptions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("subscriptions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "subscriptions" AS PERMISSIVE FOR UPDATE TO public USING ("subscriptions"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("subscriptions"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "subscriptions" AS PERMISSIVE FOR DELETE TO public USING ("subscriptions"."user_id" = current_setting('app.user_id', true));