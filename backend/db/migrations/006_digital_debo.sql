-- Run after 005. Existing batches are retained as legacy, not silently confirmed.
ALTER TABLE digital_debo_batches ALTER COLUMN status DROP DEFAULT;
ALTER TABLE digital_debo_batches ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE digital_debo_batches ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE digital_debo_batches ALTER COLUMN total_quantity TYPE numeric;
ALTER TABLE digital_debo_batches
  ADD COLUMN unit text NOT NULL DEFAULT 'quintal',
  ADD COLUMN criteria jsonb,
  ADD COLUMN request_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD CONSTRAINT debo_status CHECK(status IN ('pending','filled','fulfilled','cancelled','expired')),
  ADD CONSTRAINT debo_unit CHECK(unit IN ('kg','quintal','ton')),
  ADD CONSTRAINT debo_target CHECK(total_quantity IS NOT NULL AND total_quantity > 0) NOT VALID;
CREATE UNIQUE INDEX debo_request_retry ON digital_debo_batches(target_buyer_id,request_id);
ALTER TABLE debo_batch_listings
  ADD COLUMN proposed_quantity numeric,
  ADD COLUMN confirmed_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN unit text,
  ADD COLUMN unit_price numeric,
  ADD COLUMN conversion_factor numeric,
  ADD COLUMN distance_meters double precision,
  ADD COLUMN participation_status text NOT NULL DEFAULT 'legacy',
  ADD COLUMN reservation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN confirmed_at timestamptz,
  ADD CONSTRAINT debo_participation CHECK(participation_status IN ('legacy','proposed','accepted','declined')),
  ADD CONSTRAINT debo_reservation CHECK(reservation_status IN ('none','active','released','fulfilled')),
  ADD CONSTRAINT debo_contribution CHECK((participation_status='legacy' AND proposed_quantity IS NULL AND confirmed_quantity=0 AND reservation_status='none') OR
    (participation_status<>'legacy' AND proposed_quantity IS NOT NULL AND proposed_quantity > 0 AND confirmed_quantity >= 0 AND confirmed_quantity <= proposed_quantity
     AND unit IS NOT NULL AND unit IN ('kg','quintal','ton') AND unit_price IS NOT NULL AND unit_price > 0
     AND conversion_factor IS NOT NULL AND conversion_factor > 0
     AND (reservation_status NOT IN ('active','fulfilled') OR (participation_status='accepted' AND confirmed_quantity > 0 AND confirmed_at IS NOT NULL))));
CREATE INDEX debo_listing_reservations ON debo_batch_listings(listing_id,reservation_status);
CREATE FUNCTION public.debo_guard_contribution() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE stock numeric; committed numeric;
BEGIN
 IF NEW.reservation_status IN ('active','fulfilled') THEN
   SELECT quantity INTO stock FROM produce_listings WHERE listing_id=NEW.listing_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM transactions WHERE listing_id=NEW.listing_id AND escrow_status IN ('locked','released')) THEN
     stock := 0;
   END IF;
   SELECT coalesce(sum(confirmed_quantity),0) INTO committed FROM debo_batch_listings
    WHERE listing_id=NEW.listing_id AND reservation_status IN ('active','fulfilled')
    AND batch_id<>NEW.batch_id;
   IF committed+NEW.confirmed_quantity>stock THEN
     RAISE EXCEPTION 'Contribution exceeds unreserved stock' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER debo_contribution_integrity BEFORE INSERT OR UPDATE ON debo_batch_listings
 FOR EACH ROW EXECUTE FUNCTION public.debo_guard_contribution();
ALTER TABLE transactions ADD COLUMN payment_status text NOT NULL DEFAULT 'legacy'
 CHECK(payment_status IN ('legacy','pending','confirmed'));
CREATE INDEX IF NOT EXISTS debo_direct_listing_inventory ON transactions(listing_id)
 WHERE escrow_status IN ('locked','released');

-- Native listing units throughout the ledger. Never decrement total stock on
-- fulfillment: fulfilled contributions stay in this sum permanently.
CREATE FUNCTION public.debo_available(l public.produce_listings) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT greatest(0, l.quantity - coalesce((SELECT sum(d.confirmed_quantity)
 FROM public.debo_batch_listings d WHERE d.listing_id=l.listing_id
 AND d.reservation_status IN ('active','fulfilled')),0)
 - CASE WHEN EXISTS(SELECT 1 FROM public.transactions t WHERE t.listing_id=l.listing_id
   AND t.escrow_status IN ('locked','released')) THEN l.quantity ELSE 0 END);
$$;

-- All inventory writers lock the listing first. Protect commitments even from
-- admin moderation and old API clients, not just the Debo screens.
CREATE FUNCTION public.debo_guard_listing() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM debo_batch_listings WHERE listing_id=OLD.listing_id
           AND reservation_status IN ('active','fulfilled')) AND
    (NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.unit IS DISTINCT FROM OLD.unit
     OR NEW.crop_type IS DISTINCT FROM OLD.crop_type OR NEW.variety IS DISTINCT FROM OLD.variety
     OR NEW.quality_grade IS DISTINCT FROM OLD.quality_grade OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit OR NEW.location_gps::text IS DISTINCT FROM OLD.location_gps::text
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status='sold' AND public.debo_available(OLD)=0
       AND NOT EXISTS(SELECT 1 FROM debo_batch_listings WHERE listing_id=OLD.listing_id AND reservation_status='active')))) THEN
   RAISE EXCEPTION 'Listing has committed or fulfilled Digital Debo stock' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER debo_listing_commitments BEFORE UPDATE ON produce_listings
FOR EACH ROW EXECUTE FUNCTION public.debo_guard_listing();

-- API-only access: remove permissive legacy policies on these two tables.
ALTER TABLE digital_debo_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE debo_batch_listings ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('digital_debo_batches','debo_batch_listings') LOOP
 EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
REVOKE ALL ON digital_debo_batches, debo_batch_listings FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.debo_available(public.produce_listings) FROM PUBLIC;
