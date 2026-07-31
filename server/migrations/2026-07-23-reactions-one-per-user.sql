-- Migration: One reaction per user per message.
-- Changes:
--   1. Dedupe existing rows — keep only the most recent reaction per (message_id, user_id)
--   2. Drop UNIQUE(message_id, user_id, emoji) — was too permissive (one user could have many)
--   3. Add UNIQUE(message_id, user_id) — enforces the new invariant
--
-- Behaviour change in the app:
--   - When a user clicks an emoji they already have on a message, it toggles OFF.
--   - When they click a DIFFERENT emoji, the existing row is UPDATED in place
--     (no flicker — the old chip decrements and the new one increments atomically).
--   - The `mine` flag in the API response indicates which (at most one) emoji the
--     current user has on the message.

-- Step 1: dedupe. Keep the row with the highest `id` per (message_id, user_id)
--         (id is auto-increment, so higher id = later).
DELETE r1
FROM project_message_reactions r1
INNER JOIN project_message_reactions r2
  ON r1.message_id = r2.message_id
 AND r1.user_id   = r2.user_id
 AND r1.id        < r2.id;

-- Step 2: drop the old UNIQUE constraint
ALTER TABLE project_message_reactions DROP INDEX uniq_reaction;

-- Step 3: add the new UNIQUE constraint — one reaction per user per message
ALTER TABLE project_message_reactions
  ADD UNIQUE KEY uniq_user_message (message_id, user_id);
