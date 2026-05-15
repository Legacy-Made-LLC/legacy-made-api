-- SECURITY DEFINER helpers that break the policy recursion between
-- master_subscriptions and master_subscription_members.  See the doc comment
-- above the MASTER SUBSCRIPTIONS section in src/schema.ts for the rationale.

CREATE OR REPLACE FUNCTION public.current_user_owns_master_sub(sub_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM master_subscriptions
      WHERE id = sub_id
        AND owner_user_id = current_setting('app.user_id', true)
    )
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.current_user_is_active_member_of(sub_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM master_subscription_members
      WHERE master_subscription_id = sub_id
        AND user_id = current_setting('app.user_id', true)
        AND status = 'active'
    )
  $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_user') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_owns_master_sub(uuid) TO api_user';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_is_active_member_of(uuid) TO api_user';
  END IF;
END
$$;
--> statement-breakpoint
ALTER POLICY "master_subscription_members_owner_read" ON "master_subscription_members" TO public USING (public.current_user_owns_master_sub("master_subscription_members"."master_subscription_id"));--> statement-breakpoint
ALTER POLICY "master_subscriptions_member_read" ON "master_subscriptions" TO public USING (public.current_user_is_active_member_of("master_subscriptions"."id"));
