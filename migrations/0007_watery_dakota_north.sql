ALTER POLICY "crud-public-policy-select" ON "plan_activity_log" RENAME TO "plan_activity_log_select";--> statement-breakpoint
DROP POLICY "crud-public-policy-insert" ON "plan_activity_log" CASCADE;--> statement-breakpoint
DROP POLICY "crud-public-policy-update" ON "plan_activity_log" CASCADE;--> statement-breakpoint
DROP POLICY "crud-public-policy-delete" ON "plan_activity_log" CASCADE;