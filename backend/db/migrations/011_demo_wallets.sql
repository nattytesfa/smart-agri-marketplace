-- Virtual ETB only. Extends the existing allocation escrow ledger.
BEGIN;
CREATE TABLE demo_wallet_accounts (
 wallet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL UNIQUE REFERENCES users(user_id),
 wallet_type text NOT NULL CHECK(wallet_type IN ('buyer','farmer')),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE demo_wallet_entries (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 wallet_id uuid NOT NULL REFERENCES demo_wallet_accounts(wallet_id),
 event_type text NOT NULL CHECK(event_type IN ('demo_top_up','checkout_debit','farmer_settlement','buyer_refund')),
 amount_minor bigint NOT NULL CHECK(amount_minor<>0),
 transaction_id uuid REFERENCES transactions(transaction_id),
 escrow_event_id uuid UNIQUE REFERENCES simulated_escrow_ledger(event_id),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(wallet_id,idempotency_key),
 CHECK((event_type='checkout_debit' AND amount_minor<0 AND transaction_id IS NOT NULL AND escrow_event_id IS NULL)
 OR (event_type='demo_top_up' AND amount_minor>0 AND transaction_id IS NULL AND escrow_event_id IS NULL)
 OR (event_type IN ('farmer_settlement','buyer_refund') AND amount_minor>0 AND transaction_id IS NOT NULL AND escrow_event_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_wallet_checkout_debit ON demo_wallet_entries(transaction_id) WHERE event_type='checkout_debit';
CREATE INDEX wallet_history ON demo_wallet_entries(wallet_id,created_at DESC,event_id);
CREATE TRIGGER immutable_wallet_entries BEFORE UPDATE OR DELETE ON demo_wallet_entries
 FOR EACH ROW EXECUTE FUNCTION public.simulation_immutable();
CREATE TRIGGER immutable_wallet_accounts BEFORE UPDATE OR DELETE ON demo_wallet_accounts
 FOR EACH ROW EXECUTE FUNCTION public.simulation_immutable();
CREATE FUNCTION public.demo_wallet_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE w demo_wallet_accounts; t transactions; e simulated_escrow_ledger; a transaction_allocations; balance numeric;
BEGIN
 SELECT * INTO w FROM demo_wallet_accounts WHERE wallet_id=NEW.wallet_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM users WHERE user_id=w.owner_id AND role::text=w.wallet_type) THEN
  RAISE EXCEPTION 'Wallet owner role mismatch' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount_minor),0) INTO balance FROM demo_wallet_entries WHERE wallet_id=w.wallet_id;
 IF balance+NEW.amount_minor<0 THEN RAISE EXCEPTION 'Insufficient demo balance' USING ERRCODE='23514'; END IF;
 IF NEW.event_type='demo_top_up' THEN
  IF w.wallet_type<>'buyer' THEN RAISE EXCEPTION 'Only buyers may top up' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO t FROM transactions WHERE transaction_id=NEW.transaction_id;
  IF NEW.event_type='checkout_debit' THEN
   IF w.owner_id<>t.buyer_id OR w.wallet_type<>'buyer' OR t.simulation_version IS DISTINCT FROM 'v1'
    OR t.payment_method<>'demo_wallet' OR t.payment_status<>'simulated_paid' OR NEW.amount_minor<>-t.total_minor THEN
    RAISE EXCEPTION 'Invalid wallet checkout debit' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT * INTO e FROM simulated_escrow_ledger WHERE event_id=NEW.escrow_event_id;
   SELECT * INTO a FROM transaction_allocations WHERE allocation_id=e.allocation_id;
   IF e.event_id IS NULL OR a.transaction_id<>NEW.transaction_id OR e.amount_minor<>NEW.amount_minor
    OR NOT ((NEW.event_type='farmer_settlement' AND e.event_type='settlement' AND w.wallet_type='farmer' AND w.owner_id=a.farmer_id)
     OR (NEW.event_type='buyer_refund' AND e.event_type='refund' AND w.wallet_type='buyer' AND w.owner_id=t.buyer_id)) THEN
    RAISE EXCEPTION 'Wallet credit requires matching escrow release' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_entry_integrity BEFORE INSERT ON demo_wallet_entries
 FOR EACH ROW EXECUTE FUNCTION public.demo_wallet_guard();
-- Releases from wallet AND simulated provider checkouts credit virtual ETB once.
CREATE FUNCTION public.demo_wallet_release() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a transaction_allocations; owner uuid; kind text; wid uuid;
BEGIN
 IF NEW.event_type='hold' THEN RETURN NEW; END IF;
 SELECT * INTO a FROM transaction_allocations WHERE allocation_id=NEW.allocation_id;
 IF NEW.event_type='settlement' THEN owner:=a.farmer_id; kind:='farmer';
 ELSE SELECT buyer_id INTO owner FROM transactions WHERE transaction_id=a.transaction_id; kind:='buyer'; END IF;
 INSERT INTO demo_wallet_accounts(owner_id,wallet_type) VALUES(owner,kind) ON CONFLICT(owner_id) DO NOTHING;
 SELECT wallet_id INTO wid FROM demo_wallet_accounts WHERE owner_id=owner;
 INSERT INTO demo_wallet_entries(wallet_id,event_type,amount_minor,transaction_id,escrow_event_id,idempotency_key,created_at)
 VALUES(wid,CASE WHEN kind='farmer' THEN 'farmer_settlement' ELSE 'buyer_refund' END,
 NEW.amount_minor,a.transaction_id,NEW.event_id,'escrow:'||NEW.event_id,NEW.created_at);
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_escrow_release AFTER INSERT ON simulated_escrow_ledger
 FOR EACH ROW EXECUTE FUNCTION public.demo_wallet_release();
CREATE FUNCTION public.demo_wallet_funding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE tid uuid; t transactions; holds numeric; debits numeric;
BEGIN
 tid:=NEW.transaction_id;
 SELECT * INTO t FROM transactions WHERE transaction_id=tid;
 SELECT coalesce(sum(e.amount_minor),0) INTO holds FROM simulated_escrow_ledger e
 JOIN transaction_allocations a USING(allocation_id) WHERE a.transaction_id=tid AND e.event_type='hold';
 SELECT coalesce(sum(-amount_minor),0) INTO debits FROM demo_wallet_entries WHERE transaction_id=tid AND event_type='checkout_debit';
 IF (t.payment_method='demo_wallet' AND t.payment_status IN ('simulated_paid','refunded') AND (debits<>t.total_minor OR holds<>debits))
 OR (debits<>0 AND (t.payment_method<>'demo_wallet' OR holds<>debits)) THEN
 RAISE EXCEPTION 'Wallet funding does not reconcile with escrow' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER wallet_funding_transaction AFTER INSERT OR UPDATE ON transactions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.demo_wallet_funding_guard();
CREATE CONSTRAINT TRIGGER wallet_funding_entry AFTER INSERT ON demo_wallet_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.demo_wallet_funding_guard();
-- Import historical releases by reference; do not rewrite historical money.
INSERT INTO demo_wallet_accounts(owner_id,wallet_type)
 SELECT user_id,role::text FROM users WHERE role IN ('buyer','farmer');
INSERT INTO demo_wallet_entries(wallet_id,event_type,amount_minor,transaction_id,escrow_event_id,idempotency_key,created_at)
 SELECT w.wallet_id,CASE WHEN e.event_type='settlement' THEN 'farmer_settlement' ELSE 'buyer_refund' END,
 e.amount_minor,a.transaction_id,e.event_id,'escrow:'||e.event_id,e.created_at
 FROM simulated_escrow_ledger e JOIN transaction_allocations a USING(allocation_id)
 JOIN transactions t USING(transaction_id) JOIN demo_wallet_accounts w ON w.owner_id=CASE WHEN e.event_type='settlement' THEN a.farmer_id ELSE t.buyer_id END
 WHERE e.event_type IN ('settlement','refund') ORDER BY e.created_at,e.event_id;
ALTER TABLE demo_wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_wallet_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_wallet_accounts,demo_wallet_entries FROM anon,authenticated;
COMMIT;
