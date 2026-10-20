-- 004_relink_users_to_auth_ids.sql
--
-- public.users.user_id must be the Supabase auth user id.
--
-- Every write path keys on the session's user id (`req.user.id` in the
-- backend, `session.user.id` in the app), so a row stored under any other id is
-- invisible: `GET /api/auth/me` 404s, the app concludes the phone is not
-- registered, and a user with a perfectly good account gets sent back through
-- "Create Account" — where the register endpoint then rejects the phone with a
-- 409, because a row for it does exist.
--
-- That is what the seeded rows hit: the +251925654056 farmer row was created
-- under a uuid that is not the auth user for that phone, so signing in with
-- that number could never resolve. This pairs rows up by phone (the identity
-- that cannot drift) and moves each row, plus everything referencing it, onto
-- the current auth id.
--
-- Why one statement: the foreign keys below are NOT DEFERRABLE, so each one is
-- checked when its statement ends. Moving a user id in its own statement would
-- leave the profiles and listings pointing at a row that no longer exists;
-- batching the moves into one CTE chain means every check runs only once all
-- of them have landed.
--
-- Idempotent: rows whose ids already agree are not paired, so re-running is a
-- no-op. NOTE: Supabase stores auth.users.phone without the leading '+'.

BEGIN;

WITH map AS (
  SELECT l.user_id AS old_id, a.id AS new_id
  FROM public.users l
  JOIN auth.users a ON l.phone_number = '+' || a.phone
  WHERE l.user_id <> a.id
),
moved_produce_listings AS (
  UPDATE public.produce_listings t SET farmer_id = m.new_id
  FROM map m WHERE t.farmer_id = m.old_id
),
moved_farmer_profiles AS (
  UPDATE public.farmer_profiles t SET farmer_id = m.new_id
  FROM map m WHERE t.farmer_id = m.old_id
),
moved_buyer_profiles AS (
  UPDATE public.buyer_profiles t SET buyer_id = m.new_id
  FROM map m WHERE t.buyer_id = m.old_id
),
moved_advisory AS (
  UPDATE public.advisory_notifications t SET farmer_id = m.new_id
  FROM map m WHERE t.farmer_id = m.old_id
),
moved_subscriptions AS (
  UPDATE public.subscriptions t SET user_id = m.new_id
  FROM map m WHERE t.user_id = m.old_id
),
moved_debo_batches AS (
  UPDATE public.digital_debo_batches t SET target_buyer_id = m.new_id
  FROM map m WHERE t.target_buyer_id = m.old_id
),
moved_transactions AS (
  UPDATE public.transactions t
  SET farmer_id = CASE WHEN t.farmer_id = m.old_id THEN m.new_id ELSE t.farmer_id END,
      buyer_id  = CASE WHEN t.buyer_id  = m.old_id THEN m.new_id ELSE t.buyer_id  END
  FROM map m
  WHERE t.farmer_id = m.old_id OR t.buyer_id = m.old_id
)
UPDATE public.users u SET user_id = map.new_id
FROM map WHERE u.user_id = map.old_id;

COMMIT;

-- In this database exactly one row was affected (+251925654056, 1 farmer
-- profile and 1 advisory notification; no listings, subscriptions or
-- transactions). +251912345678 and +251900000000 have no auth user to pair
-- with, so they are left alone on purpose: there is nothing to relink them to.
