-- UAT records only. No relationship that can credit demo_wallet_entries.
BEGIN;
CREATE TABLE telebirr_uat_funding (
 funding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_id uuid NOT NULL REFERENCES users(user_id),
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 provider text NOT NULL DEFAULT 'telebirr' CHECK(provider='telebirr'),
 provider_environment text NOT NULL DEFAULT 'uat' CHECK(provider_environment='uat'),
 merchant_reference text NOT NULL UNIQUE,
 provider_reference text UNIQUE,
 -- The evidenced preOrder reference above is NOT a final transaction ID.
 provider_transaction_reference text UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','awaiting_authorization','verification_pending','verified_success','failed','cancelled','expired','reconciliation_required')),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '120 minutes',
 verified_at timestamptz,
 reconciliation_reason text,
 verification_attempts integer NOT NULL DEFAULT 0 CHECK(verification_attempts BETWEEN 0 AND 8),
 next_verification_at timestamptz DEFAULT now()+interval '30 seconds',
 UNIQUE(buyer_id,idempotency_key),
 -- Fail closed until an official authoritative verification contract is added
 -- in a reviewed migration. No local/API/SDK claim may create a final outcome.
 CHECK(status NOT IN ('verified_success','failed','cancelled','expired')),
 CHECK(verified_at IS NULL)
);
CREATE INDEX telebirr_uat_recovery ON telebirr_uat_funding(next_verification_at) WHERE next_verification_at IS NOT NULL;
CREATE INDEX telebirr_uat_buyer_history ON telebirr_uat_funding(buyer_id,created_at DESC,funding_id);
CREATE TABLE telebirr_uat_audit (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 funding_id uuid NOT NULL REFERENCES telebirr_uat_funding(funding_id),
 event_type text NOT NULL CHECK(event_type IN ('created','preorder_created','preorder_unconfirmed','sdk_interaction_ended','verification_blocked')),
 -- Fixed application-generated codes only; no raw provider/SDK payloads.
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(funding_id,event_type,reason)
);
CREATE FUNCTION public.telebirr_uat_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'UAT funding records cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM users WHERE user_id=NEW.buyer_id AND role='buyer') THEN
   RAISE EXCEPTION 'Buyer required' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.funding_id,NEW.buyer_id,NEW.amount_minor,NEW.currency,NEW.provider,NEW.provider_environment,NEW.merchant_reference,NEW.idempotency_key,NEW.created_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.funding_id,OLD.buyer_id,OLD.amount_minor,OLD.currency,OLD.provider,OLD.provider_environment,OLD.merchant_reference,OLD.idempotency_key,OLD.created_at,OLD.expires_at)
   OR (OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference) THEN
   RAISE EXCEPTION 'UAT funding identity is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER telebirr_uat_integrity BEFORE INSERT OR UPDATE OR DELETE ON telebirr_uat_funding FOR EACH ROW EXECUTE FUNCTION public.telebirr_uat_guard();
CREATE TRIGGER telebirr_uat_audit_immutable BEFORE UPDATE OR DELETE ON telebirr_uat_audit FOR EACH ROW EXECUTE FUNCTION public.simulation_immutable();
ALTER TABLE telebirr_uat_funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE telebirr_uat_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telebirr_uat_funding,telebirr_uat_audit FROM anon,authenticated;
COMMIT;
