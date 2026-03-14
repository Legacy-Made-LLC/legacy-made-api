CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "bypass_rls_policy" ON "push_tokens" AS PERMISSIVE FOR ALL TO public USING ('on' = current_setting('app.bypass_rls_status', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-select" ON "push_tokens" AS PERMISSIVE FOR SELECT TO public USING ("push_tokens"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-insert" ON "push_tokens" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("push_tokens"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-update" ON "push_tokens" AS PERMISSIVE FOR UPDATE TO public USING ("push_tokens"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("push_tokens"."user_id" = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "crud-public-policy-delete" ON "push_tokens" AS PERMISSIVE FOR DELETE TO public USING ("push_tokens"."user_id" = current_setting('app.user_id', true));