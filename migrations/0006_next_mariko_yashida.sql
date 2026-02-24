CREATE POLICY "trusted_contacts_self_read" ON "trusted_contacts" AS PERMISSIVE FOR SELECT TO public USING ("trusted_contacts"."clerk_user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER POLICY "crud-public-policy-select" ON "entries" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "entries"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit', 'full_view')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "entries" TO public WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "entries"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "entries" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "entries"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  )) WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "entries"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "entries" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "entries"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "entries"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-select" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level IN ('full_edit', 'full_view')
              )
            )
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level IN ('full_edit', 'full_view', 'limited_view')
              )
            )
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level IN ('full_edit', 'full_view', 'limited_view')
              )
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "files" TO public WITH CHECK (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
      ) WITH CHECK (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = "files"."entry_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."wish_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = "files"."wish_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          "files"."message_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = "files"."message_id"
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "crud-public-policy-select" ON "messages" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "messages"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit', 'full_view', 'limited_view')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "messages" TO public WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "messages"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "messages" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "messages"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  )) WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "messages"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "messages" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "messages"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "messages"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-select" ON "wishes" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "wishes"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit', 'full_view', 'limited_view')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-insert" ON "wishes" TO public WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "wishes"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-update" ON "wishes" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "wishes"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  )) WITH CHECK ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "wishes"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));--> statement-breakpoint
ALTER POLICY "crud-public-policy-delete" ON "wishes" TO public USING ((
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = "wishes"."plan_id" 
    AND plans.user_id = current_setting('app.user_id', true)
  )
) OR (
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = "wishes"."plan_id"
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN ('full_edit')
    )
  ));