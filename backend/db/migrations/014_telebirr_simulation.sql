-- Internal demonstration only. Reuses demo_top_up credits; never UAT proof.
BEGIN;
CREATE TABLE telebirr_demo_payments (
 payment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_id uuid NOT NULL REFERENCES users(user_id),
 reference text NOT NULL UNIQUE CHECK(reference LIKE 'DEMO-TB-%'),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 100000000),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 environment text NOT NULL CHECK(environment IN ('development','test','demo')),
 status text NOT NULL DEFAULT 'PENDING_AUTHORIZATION' CHECK(status IN ('PENDING_AUTHORIZATION','AUTHORIZED','CREDITED','DECLINED','CANCELLED','EXPIRED','FAILED')),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 ledger_event_id uuid UNIQUE REFERENCES demo_wallet_entries(event_id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 authorized_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK((status='CREDITED')=(ledger_event_id IS NOT NULL)),
 CHECK((status IN ('AUTHORIZED','CREDITED'))=(authorized_at IS NOT NULL)),
 UNIQUE(buyer_id,idempotency_key)
);
CREATE INDEX telebirr_demo_history ON telebirr_demo_payments(buyer_id,created_at DESC,payment_id);
CREATE INDEX telebirr_demo_expiry ON telebirr_demo_payments(expires_at) WHERE status='PENDING_AUTHORIZATION';
CREATE TABLE telebirr_demo_audit (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES telebirr_demo_payments(payment_id),
 status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION public.telebirr_demo_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Simulation records are durable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING_AUTHORIZATION' OR NOT EXISTS(SELECT 1 FROM users WHERE user_id=NEW.buyer_id AND role='buyer') THEN
   RAISE EXCEPTION 'Pending buyer simulation required'; END IF;
 ELSE
  IF ROW(NEW.payment_id,NEW.buyer_id,NEW.reference,NEW.amount_minor,NEW.currency,NEW.environment,NEW.idempotency_key,NEW.created_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.payment_id,OLD.buyer_id,OLD.reference,OLD.amount_minor,OLD.currency,OLD.environment,OLD.idempotency_key,OLD.created_at,OLD.expires_at)
   OR NOT ((OLD.status='PENDING_AUTHORIZATION' AND NEW.status IN ('AUTHORIZED','DECLINED','CANCELLED','EXPIRED','FAILED')) OR (OLD.status='AUTHORIZED' AND NEW.status='CREDITED')) THEN
    RAISE EXCEPTION 'Invalid simulation transition'; END IF;
  IF NEW.status='AUTHORIZED' AND (NEW.expires_at<=clock_timestamp() OR abs(extract(epoch FROM NEW.authorized_at-clock_timestamp()))>1) THEN
   RAISE EXCEPTION 'Authorization expired or invalid'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER telebirr_demo_integrity BEFORE INSERT OR UPDATE OR DELETE ON telebirr_demo_payments FOR EACH ROW EXECUTE FUNCTION public.telebirr_demo_guard();
CREATE FUNCTION public.telebirr_demo_audit_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO telebirr_demo_audit(payment_id,status) VALUES(NEW.payment_id,NEW.status);
 RETURN NEW;
END $$;
CREATE TRIGGER telebirr_demo_state_audit AFTER INSERT OR UPDATE ON telebirr_demo_payments FOR EACH ROW EXECUTE FUNCTION public.telebirr_demo_audit_transition();
CREATE TRIGGER telebirr_demo_audit_immutable BEFORE UPDATE OR DELETE ON telebirr_demo_audit FOR EACH ROW EXECUTE FUNCTION public.simulation_immutable();
CREATE FUNCTION public.telebirr_demo_reconcile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p telebirr_demo_payments;
BEGIN
 IF TG_TABLE_NAME='demo_wallet_entries' THEN
  IF NEW.idempotency_key NOT LIKE 'telebirr-demo:%' THEN RETURN NULL; END IF;
  SELECT * INTO p FROM telebirr_demo_payments WHERE ledger_event_id=NEW.event_id;
  IF p.payment_id IS NULL THEN RAISE EXCEPTION 'Simulation credit must be linked'; END IF;
 ELSE
  SELECT * INTO p FROM telebirr_demo_payments WHERE payment_id=NEW.payment_id;
 END IF;
 IF p.status='AUTHORIZED' THEN RAISE EXCEPTION 'Authorization and credit must commit together'; END IF;
 IF p.status='CREDITED' AND NOT EXISTS(SELECT 1 FROM demo_wallet_entries e JOIN demo_wallet_accounts w USING(wallet_id)
  WHERE e.event_id=p.ledger_event_id AND w.owner_id=p.buyer_id AND e.event_type='demo_top_up'
  AND e.amount_minor=p.amount_minor AND e.idempotency_key='telebirr-demo:'||p.payment_id) THEN
  RAISE EXCEPTION 'Simulation credit does not reconcile'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER telebirr_demo_credit_check AFTER INSERT OR UPDATE ON telebirr_demo_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.telebirr_demo_reconcile();
CREATE CONSTRAINT TRIGGER telebirr_demo_entry_check AFTER INSERT ON demo_wallet_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.telebirr_demo_reconcile();
ALTER TABLE telebirr_demo_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE telebirr_demo_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telebirr_demo_payments,telebirr_demo_audit FROM anon,authenticated;
COMMIT;
