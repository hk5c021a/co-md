CREATE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "permissions_granted_by_idx" ON "permissions" USING btree ("granted_by");--> statement-breakpoint
CREATE INDEX "sessions_refresh_token_hash_idx" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
ALTER TABLE "contact_invitations" ADD CONSTRAINT "contact_invitations_inviter_invitee_idx" UNIQUE("inviter_id","invitee_id");