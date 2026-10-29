-- Additive migration. Legacy rows are retained; NOT VALID checks apply to new writes.
ALTER TABLE produce_listings
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS quality_grade text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS kebele text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_operation_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- Widen existing numeric precision without rounding/dropping historical values.
-- Positive fractional quintals must not round to zero during synchronization.
ALTER TABLE produce_listings
  ALTER COLUMN quantity TYPE numeric,
  ALTER COLUMN price_per_unit TYPE numeric;
CREATE UNIQUE INDEX IF NOT EXISTS listings_farmer_client_id ON produce_listings(farmer_id, client_id);
CREATE INDEX IF NOT EXISTS listings_location_geography ON produce_listings USING gist ((location_gps::geography));
ALTER TABLE produce_listings ADD CONSTRAINT listings_description_length CHECK (char_length(description) <= 500) NOT VALID;
ALTER TABLE produce_listings ADD CONSTRAINT listings_grade CHECK (quality_grade IN ('A','B','C','not_graded')) NOT VALID;
ALTER TABLE produce_listings ADD CONSTRAINT listings_required_details CHECK (
  deleted_at IS NOT NULL OR (farmer_id IS NOT NULL AND length(trim(crop_type)) > 0 AND variety IS NOT NULL AND length(trim(variety)) > 0
  AND quantity IS NOT NULL AND quantity > 0 AND price_per_unit IS NOT NULL AND price_per_unit > 0
  AND unit IN ('quintal','kg','ton')
  AND (location_gps IS NOT NULL OR (kebele IS NOT NULL AND length(trim(kebele)) > 0)))
) NOT VALID;
ALTER TABLE produce_listings ADD CONSTRAINT listings_harvest_date CHECK (harvest_date <= CURRENT_DATE) NOT VALID;

-- Browser/mobile clients read only. Writes go through the authorized API, including
-- optimistic concurrency and transaction/reservation checks. Remove legacy permissive policies.
-- The legacy users ALL policy otherwise allows a client to promote itself to
-- farmer/admin and bypass API role checks. Profile writes already use the backend.
CREATE OR REPLACE FUNCTION public.marketplace_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.users WHERE user_id=auth.uid() AND role='admin');
$$;
REVOKE ALL ON FUNCTION public.marketplace_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_is_admin() TO authenticated;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated" ON users;
CREATE POLICY users_read_secure ON users FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.marketplace_is_admin());
ALTER TABLE produce_listings ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='produce_listings' LOOP
    EXECUTE format('DROP POLICY %I ON public.produce_listings', p.policyname);
  END LOOP;
END $$;
CREATE POLICY listings_read ON produce_listings FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (farmer_id = auth.uid() OR status = 'available' OR public.marketplace_is_admin()));

-- Public produce photographs only; uploads are restricted to the server service role.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('produce-images','produce-images',true,204800,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- The live batch schema predates its service's crop_type field.
ALTER TABLE digital_debo_batches ADD COLUMN IF NOT EXISTS crop_type text;
