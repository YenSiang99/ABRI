-- Renames the vouch vocabulary in place. No structural change — status,
-- action and reason are plain strings — so this migration is entirely data
-- rewrites, and it must run for existing rows or the app will read values
-- (`changes_requested`, `decline`) that nothing in the code answers to any
-- more: lib/vouchTurn.js would report "nobody's turn" for a live vouch.
--
--   changes_requested -> reverted     (receiver sent it back to be edited)
--   declined          -> cancelled    (receiver ended it; also the expiry's
--                                      end state)
--   request_changes   -> revert
--   decline           -> cancel
--   unfair_decline    -> unfair_cancel
--
-- "flag" keeps its name but changes meaning: it used to be a side effect of
-- a decline and left the vouch declined, and is now its own action that
-- moves the vouch to "under_review". Historic flag rows are left alone —
-- their fromStatus/toStatus already say cancelled, which is what actually
-- happened at the time and is what an audit trail is for.

UPDATE "Vouch" SET "status" = 'reverted'  WHERE "status" = 'changes_requested';
UPDATE "Vouch" SET "status" = 'cancelled' WHERE "status" = 'declined';

UPDATE "VouchAction" SET "action" = 'revert' WHERE "action" = 'request_changes';
UPDATE "VouchAction" SET "action" = 'cancel' WHERE "action" = 'decline';

-- The status columns on the log, rewritten the same way. These are read
-- back by the timeline UI, so leaving them would show a vouch moving to a
-- status that no longer exists.
UPDATE "VouchAction" SET "fromStatus" = 'reverted'  WHERE "fromStatus" = 'changes_requested';
UPDATE "VouchAction" SET "fromStatus" = 'cancelled' WHERE "fromStatus" = 'declined';
UPDATE "VouchAction" SET "toStatus"   = 'reverted'  WHERE "toStatus"   = 'changes_requested';
UPDATE "VouchAction" SET "toStatus"   = 'cancelled' WHERE "toStatus"   = 'declined';

UPDATE "VouchFlag" SET "reason" = 'unfair_cancel' WHERE "reason" = 'unfair_decline';

UPDATE "ActivityEvent" SET "type" = 'vouch_reverted'  WHERE "type" = 'vouch_changes_requested';
UPDATE "ActivityEvent" SET "type" = 'vouch_cancelled' WHERE "type" = 'vouch_declined';
