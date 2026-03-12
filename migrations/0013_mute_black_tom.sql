ALTER TABLE "entries" DROP CONSTRAINT "entries_modified_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_modified_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "wishes" DROP CONSTRAINT "wishes_modified_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;