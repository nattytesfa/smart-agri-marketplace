-- Simulation-only accounting. No provider credentials, custody, or actual balances.
BEGIN;
ALTER TABLE transactions
 ADD COLUMN simulation_version text,
 ADD COLUMN source_listing_id uuid REFERENCES produce_listings(listing_id),
 ADD COLUMN request_id uuid,
 ADD COLUMN request_fingerprint text,
 ADD COLUMN total_minor bigint CHECK(total_minor>0);
CREATE UNIQUE INDEX transaction_request_retry ON transactions(buyer_id,request_id);
ALTER TABLE transactions DROP CONSTRAINT transactions_payment_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_payment_status_check CHECK
 (payment_status IN ('legacy','pending','confirmed','unpaid','simulated_paid','failed','refunded'));
ALTER TABLE transactions DROP CONSTRAINT checkout_state_valid;
ALTER TABLE transactions ADD CONSTRAINT checkout_state_valid CHECK
 (payment_mode IN ('legacy','prototype','external') AND checkout_status IN
 ('legacy','pending','reconciliation_required','expired','cancelled','completed','fulfilling','partially_completed')
 AND (payment_mode='legacy' OR checkout_expires_at IS NOT NULL));
CREATE UNIQUE INDEX one_simulation_checkout_per_batch ON transactions(batch_id)
 WHERE simulation_version='v1';

CREATE TABLE transaction_allocations (
 allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transaction_id uuid NOT NULL REFERENCES transactions(transaction_id),
 farmer_id uuid NOT NULL REFERENCES users(user_id),
 listing_id uuid NOT NULL REFERENCES produce_listings(listing_id),
 batch_id uuid NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>0),
 unit text NOT NULL CHECK(unit IN ('kg','quintal','ton')),
 unit_price numeric NOT NULL CHECK(unit_price>0),
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor=round(quantity*unit_price,2)*100),
 delivery_status text NOT NULL DEFAULT 'awaiting_fulfillment' CHECK(delivery_status IN
 ('awaiting_fulfillment','ready','delivered','cancelled')),
 settlement_status text NOT NULL DEFAULT 'unfunded' CHECK(settlement_status IN ('unfunded','held','settled','refunded','cancelled')),
 dispute_status text NOT NULL DEFAULT 'none' CHECK(dispute_status IN ('none','open','under_review','resolved','rejected')),
 traceability jsonb NOT NULL,
 delivered_at timestamptz,
 delivered_by uuid REFERENCES users(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(transaction_id,listing_id),
 FOREIGN KEY(batch_id,listing_id) REFERENCES debo_batch_listings(batch_id,listing_id)
);
CREATE INDEX allocation_farmer_orders ON transaction_allocations(farmer_id,created_at DESC);
CREATE TABLE simulated_escrow_ledger (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL REFERENCES transaction_allocations(allocation_id),
 event_type text NOT NULL CHECK(event_type IN ('hold','settlement','refund')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 idempotency_key text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(allocation_id,idempotency_key)
);
CREATE UNIQUE INDEX one_simulated_hold ON simulated_escrow_ledger(allocation_id) WHERE event_type='hold';
CREATE UNIQUE INDEX one_simulated_settlement ON simulated_escrow_ledger(allocation_id) WHERE event_type='settlement';
CREATE TABLE delivery_verifications (
 verification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL REFERENCES transaction_allocations(allocation_id),
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 consumed_at timestamptz,
 verified_by uuid REFERENCES users(user_id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transaction_disputes (
 dispute_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL REFERENCES transaction_allocations(allocation_id),
 buyer_id uuid NOT NULL REFERENCES users(user_id),
 reason text NOT NULL CHECK(reason IN ('not_delivered','incorrect_quantity','poor_quality','wrong_product','other')),
 description text NOT NULL CHECK(length(description) BETWEEN 10 AND 4000),
 evidence jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','under_review','resolved','rejected')),
 decision text,
 resolution_note text,
 resolved_by uuid REFERENCES users(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
CREATE UNIQUE INDEX one_unresolved_dispute ON transaction_disputes(allocation_id) WHERE status IN ('open','under_review');
CREATE TABLE transaction_audit (
 audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transaction_id uuid NOT NULL REFERENCES transactions(transaction_id),
 allocation_id uuid REFERENCES transaction_allocations(allocation_id),
 actor_id uuid REFERENCES users(user_id),
 action text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.simulation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable simulation accounting record' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_simulated_ledger BEFORE UPDATE OR DELETE ON simulated_escrow_ledger
 FOR EACH ROW EXECUTE FUNCTION public.simulation_immutable();
CREATE TRIGGER immutable_transaction_audit BEFORE UPDATE OR DELETE ON transaction_audit
 FOR EACH ROW EXECUTE FUNCTION public.simulation_immutable();
CREATE FUNCTION public.simulation_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.transaction_id,NEW.farmer_id,NEW.listing_id,NEW.batch_id,NEW.quantity,NEW.unit,NEW.unit_price,NEW.amount_minor,NEW.traceability)
 IS DISTINCT FROM (OLD.transaction_id,OLD.farmer_id,OLD.listing_id,OLD.batch_id,OLD.quantity,OLD.unit,OLD.unit_price,OLD.amount_minor,OLD.traceability)
 THEN RAISE EXCEPTION 'Agreed allocation is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_allocation_terms BEFORE UPDATE ON transaction_allocations
 FOR EACH ROW EXECUTE FUNCTION public.simulation_allocation_guard();
-- Even SQL callers cannot spend the same simulated cents twice. Serialize on
-- the allocation before reading the ledger (API additionally locks parent first).
CREATE FUNCTION public.simulation_ledger_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a transaction_allocations; t transactions; held bigint; spent bigint;
BEGIN
 SELECT * INTO a FROM transaction_allocations WHERE allocation_id=NEW.allocation_id FOR UPDATE;
 SELECT * INTO t FROM transactions WHERE transaction_id=a.transaction_id;
 IF t.simulation_version IS DISTINCT FROM 'v1' OR t.payment_status<>'simulated_paid' THEN
  RAISE EXCEPTION 'Allocation has no simulated funding' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE event_type='hold'),0),
 coalesce(sum(amount_minor) FILTER(WHERE event_type IN ('refund','settlement')),0) INTO held,spent
 FROM simulated_escrow_ledger WHERE allocation_id=NEW.allocation_id;
 IF (NEW.event_type='hold' AND (held<>0 OR NEW.amount_minor<>a.amount_minor)) OR
 (NEW.event_type<>'hold' AND spent+NEW.amount_minor>held) OR
 (NEW.event_type='settlement' AND (a.delivery_status<>'delivered' OR a.dispute_status IN ('open','under_review') OR NEW.amount_minor<>held-spent)) THEN
  RAISE EXCEPTION 'Simulated escrow invariant violated' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER simulated_ledger_integrity BEFORE INSERT ON simulated_escrow_ledger
 FOR EACH ROW EXECUTE FUNCTION public.simulation_ledger_guard();
CREATE FUNCTION public.simulation_reconcile_total() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE t transactions;
BEGIN
 SELECT * INTO t FROM transactions WHERE transaction_id=NEW.transaction_id;
 IF t.simulation_version='v1' AND (t.total_minor<>t.amount*100 OR
 t.total_minor<>(SELECT coalesce(sum(amount_minor),0) FROM transaction_allocations WHERE transaction_id=t.transaction_id)) THEN
 RAISE EXCEPTION 'Allocation total does not reconcile' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER simulation_total_transaction AFTER INSERT OR UPDATE ON transactions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.simulation_reconcile_total();
CREATE CONSTRAINT TRIGGER simulation_total_allocation AFTER INSERT OR UPDATE ON transaction_allocations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.simulation_reconcile_total();
-- Keep the 008 recovery function unchanged. Its expired/cancelled transitions
-- also close new unpaid allocations and record durable system audit evidence.
CREATE FUNCTION public.simulation_recovery_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.simulation_version='v1' AND NEW.checkout_status IN ('expired','cancelled') AND OLD.checkout_status='pending' THEN
 UPDATE transaction_allocations SET delivery_status='cancelled',settlement_status='cancelled' WHERE transaction_id=NEW.transaction_id;
 INSERT INTO transaction_audit(transaction_id,action,metadata) VALUES(NEW.transaction_id,NEW.checkout_status,jsonb_build_object('reason',NEW.reconciliation_reason));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER simulation_recovery_history AFTER UPDATE ON transactions
 FOR EACH ROW EXECUTE FUNCTION public.simulation_recovery_audit();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['transaction_allocations','simulated_escrow_ledger','delivery_verifications','transaction_disputes','transaction_audit'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',n);
 END LOOP;
END $$;
COMMIT;
