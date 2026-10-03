-- Registration collects the user's name and location before the phone OTP is
-- sent, so those values have to be persisted with the account.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS zone TEXT,
  ADD COLUMN IF NOT EXISTS kebele TEXT;

-- Location is used for grouping and filtering listings by area.
CREATE INDEX IF NOT EXISTS idx_users_region_zone
  ON users (region, zone);