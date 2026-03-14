ALTER TABLE "user_keys" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "deactivated_at" timestamp with time zone;