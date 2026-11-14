CREATE TABLE "push_tickets" (
	"ticket_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tickets_created_at_idx" ON "push_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "push_tickets" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
-- Safe casts for the reminder scheduler: return NULL instead of raising, so
-- one malformed preferences row can't fail the eligibility query for everyone.
CREATE OR REPLACE FUNCTION "try_timestamptz"(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "try_timezone"(tz text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF tz IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM now() AT TIME ZONE tz;
  RETURN tz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;
