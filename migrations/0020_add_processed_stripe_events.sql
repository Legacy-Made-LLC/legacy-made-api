CREATE TABLE "processed_stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processed_stripe_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "processed_stripe_events_received_at_idx" ON "processed_stripe_events" USING btree ("received_at");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "processed_stripe_events" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));