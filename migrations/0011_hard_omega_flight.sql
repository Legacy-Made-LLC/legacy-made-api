ALTER POLICY "encrypted_deks_owner" ON "encrypted_deks" TO public USING ("encrypted_deks"."owner_id" = current_setting('app.user_id', true)) WITH CHECK ("encrypted_deks"."owner_id" = current_setting('app.user_id', true) AND 
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "encrypted_deks"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
);