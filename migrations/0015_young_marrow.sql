ALTER POLICY "crud-public-policy-select" ON "files" TO public USING (
        (
          "files"."entry_id" IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            WHERE e.id = "files"."entry_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = e.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE w.id = "files"."wish_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = w.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE m.id = "files"."message_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = m.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE e.id = "files"."entry_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = e.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE w.id = "files"."wish_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = w.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE m.id = "files"."message_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = m.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE e.id = "files"."entry_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = e.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE w.id = "files"."wish_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = w.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE m.id = "files"."message_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = m.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE e.id = "files"."entry_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = e.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE w.id = "files"."wish_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = w.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE m.id = "files"."message_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = m.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE e.id = "files"."entry_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = e.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE w.id = "files"."wish_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = w.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
            WHERE m.id = "files"."message_id"
            AND (
              EXISTS (
                SELECT 1 FROM plans p
                WHERE p.id = m.plan_id
                AND p.user_id = current_setting('app.user_id', true)
              )
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
      );