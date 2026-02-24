CREATE UNIQUE INDEX "trusted_contacts_plan_email_uniq" ON "trusted_contacts" USING btree ("plan_id","email");--> statement-breakpoint
CREATE POLICY "plan_activity_log_insert" ON "plan_activity_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "plan_activity_log"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "plan_activity_log"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit', 'full_view', 'limited_view', 'view_only')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "plan_activity_log" TO public WITH CHECK (false);--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "plan_activity_log" TO public USING (false) WITH CHECK (false);--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "plan_activity_log" TO public USING (false);