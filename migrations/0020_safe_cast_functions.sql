-- Safe cast for the reminder scheduler: returns NULL instead of raising, so
-- one malformed enabled_at value can't fail the eligibility query for
-- everyone.
CREATE OR REPLACE FUNCTION "try_timestamptz"(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;
