CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "key_envelopes" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
-- Remove duplicate reactions (same user, message and emoji) before enforcing uniqueness.
DELETE FROM "message_reactions" a USING "message_reactions" b
  WHERE a."message_id" = b."message_id" AND a."user_id" = b."user_id" AND a."emoji" = b."emoji" AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_unique_idx" ON "message_reactions" USING btree ("message_id","user_id","emoji");