-- Admin verification queue (FR-17) reads and writes users.fayda_verified,
-- but the live schema predates that column, so
--   GET  /api/admin/users          -> "column u.fayda_verified does not exist"
--   POST /api/admin/users/:id/verify -> UPDATE fails
--
-- fayda_verified     : the flag the admin console toggles when approving an account
-- fayda_verified_at  : audit timestamp for the approval

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fayda_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fayda_verified_at timestamptz;

-- The verification queue filters on this column.
CREATE INDEX IF NOT EXISTS idx_users_fayda_verified
  ON users (fayda_verified);
