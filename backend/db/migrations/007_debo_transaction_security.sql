-- The legacy authenticated ALL policy allowed payment_status/escrow changes
-- directly from a browser. Payments and stock settlement must use the API.
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname=current_schema() AND tablename='transactions' LOOP
  EXECUTE format('DROP POLICY %I ON %I.transactions',p.policyname,current_schema());
 END LOOP;
END $$;
CREATE POLICY transactions_read_secure ON transactions FOR SELECT TO authenticated
 USING(buyer_id=auth.uid() OR farmer_id=auth.uid() OR public.marketplace_is_admin());
REVOKE ALL ON transactions FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON transactions FROM authenticated;
GRANT SELECT ON transactions TO authenticated;
