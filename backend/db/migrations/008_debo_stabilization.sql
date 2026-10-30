-- Additive: never reprice transactions or infer payment results for old records.
ALTER TABLE digital_debo_batches ADD COLUMN IF NOT EXISTS pricing_policy text;
ALTER TABLE transactions
 ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'legacy',
 ADD COLUMN IF NOT EXISTS checkout_status text NOT NULL DEFAULT 'legacy',
 ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz,
 ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
 ADD COLUMN IF NOT EXISTS reconciliation_reason text,
 ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ETB',
 ADD COLUMN IF NOT EXISTS pricing_policy text;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_payment_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_payment_status_check
 CHECK(payment_status IN ('legacy','pending','confirmed','unpaid'));
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS checkout_state_valid;
ALTER TABLE transactions ADD CONSTRAINT checkout_state_valid CHECK(
 payment_mode IN ('legacy','prototype','external') AND checkout_status IN
 ('legacy','pending','reconciliation_required','expired','cancelled','completed')
 AND (payment_mode='legacy' OR checkout_expires_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS checkout_expiration ON transactions(checkout_expires_at)
 WHERE checkout_status IN ('pending','reconciliation_required');
-- Historical in-flight records lack trustworthy evidence of whether a gateway
-- was contacted. Surface them for review, without freeing stock or changing any
-- historical price/amount/payment result. Terminal historical records stay put.
UPDATE transactions SET checkout_status='reconciliation_required',
 reconciliation_reason='Pre-stabilization checkout; external payment attempt unknown',reconciled_at=now()
 WHERE payment_mode='legacy' AND checkout_status='legacy' AND escrow_status='locked';

-- Untrusted notifications are audit evidence, not proof of payment. Deduplicate
-- by content (not a caller-controlled event ID alone); retain conflicting events.
CREATE TABLE IF NOT EXISTS payment_notifications (
 notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transaction_id uuid NOT NULL REFERENCES transactions(transaction_id),
 fingerprint text NOT NULL,
 claimed_status text NOT NULL,
 provider_reference text,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(transaction_id,fingerprint)
);
ALTER TABLE payment_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_notifications FROM anon,authenticated;

-- Durable recovery. Only a server-created prototype checkout is KNOWN to have
-- made no external payment attempt. Silence from an external/legacy provider
-- is ambiguous: keep reservations and demand reconciliation instead of guessing.
CREATE OR REPLACE FUNCTION public.recover_expired_checkouts() RETURNS integer
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE t record; recovered integer := 0;
BEGIN
 FOR t IN SELECT * FROM transactions WHERE checkout_expires_at<=now()
   AND checkout_status IN ('pending','reconciliation_required')
   AND escrow_status='locked' ORDER BY transaction_id FOR UPDATE SKIP LOCKED LOOP
   IF t.payment_status='confirmed' THEN
     CONTINUE;
   END IF;
   IF t.payment_mode<>'prototype' OR t.checkout_status='reconciliation_required' THEN
     UPDATE transactions SET checkout_status='reconciliation_required',
       reconciliation_reason='Payment verification unavailable; reservations retained',reconciled_at=now()
       WHERE transaction_id=t.transaction_id;
     CONTINUE;
   END IF;
   IF t.batch_id IS NOT NULL THEN
     PERFORM batch_id FROM digital_debo_batches WHERE batch_id=t.batch_id FOR UPDATE;
     PERFORM l.listing_id FROM produce_listings l JOIN debo_batch_listings d ON d.listing_id=l.listing_id
       WHERE d.batch_id=t.batch_id ORDER BY l.listing_id FOR UPDATE OF l;
     -- Inconsistent historical/partly settled data is never auto-released.
     IF EXISTS(SELECT 1 FROM debo_batch_listings WHERE batch_id=t.batch_id AND reservation_status='fulfilled')
       OR EXISTS(SELECT 1 FROM digital_debo_batches WHERE batch_id=t.batch_id AND status='fulfilled') THEN
       UPDATE transactions SET checkout_status='reconciliation_required',
         reconciliation_reason='Fulfillment exists; manual reconciliation required',reconciled_at=now()
         WHERE transaction_id=t.transaction_id;
       CONTINUE;
     END IF;
     UPDATE debo_batch_listings SET reservation_status='released'
       WHERE batch_id=t.batch_id AND reservation_status='active';
     UPDATE digital_debo_batches SET status='expired',updated_at=now() WHERE batch_id=t.batch_id;
     UPDATE produce_listings SET version=version+1,updated_at=now()
       WHERE listing_id IN (SELECT listing_id FROM debo_batch_listings WHERE batch_id=t.batch_id);
   ELSE
     PERFORM listing_id FROM produce_listings WHERE listing_id=t.listing_id FOR UPDATE;
     UPDATE produce_listings SET status='available',version=version+1,updated_at=now()
       WHERE listing_id=t.listing_id AND status='reserved';
   END IF;
   UPDATE transactions SET checkout_status='expired',payment_status='unpaid',escrow_status='refunded',
     reconciled_at=now(),reconciliation_reason='Prototype checkout expired; no external payment attempt'
     WHERE transaction_id=t.transaction_id;
   recovered := recovered+1;
 END LOOP;
 RETURN recovered;
END $$;
REVOKE ALL ON FUNCTION public.recover_expired_checkouts() FROM PUBLIC,anon,authenticated;
