CREATE TABLE "processed_revenuecat_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processed_revenuecat_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "rc_original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "rc_product_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "rc_store" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "unsubscribe_detected_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "processed_revenuecat_events_received_at_idx" ON "processed_revenuecat_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "subscriptions_rc_original_transaction_id_idx" ON "subscriptions" USING btree ("rc_original_transaction_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IS NULL OR "subscriptions"."status" IN ('active', 'in_grace_period', 'expired'));--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "processed_revenuecat_events" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));