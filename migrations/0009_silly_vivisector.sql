ALTER POLICY "plan_activity_log_insert" ON "plan_activity_log" TO public WITH CHECK ((
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
      AND trusted_contacts.access_level IN ('full_edit', 'full_view', 'limited_view')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-select" ON "progress" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "progress"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit', 'full_view', 'limited_view')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "progress" TO public WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "progress"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "progress" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "progress"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  )) WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "progress"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "progress" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "progress"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "progress"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));