ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "key_backup" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ciphertext" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "iv" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "sender_public_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "recipient_public_key" text;