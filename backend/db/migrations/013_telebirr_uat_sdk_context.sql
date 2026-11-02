-- Keep 012's final-status and no-credit guards intact. Legacy preOrder rows
-- deliberately lack this new context and must never be guessed into SDK orders.
BEGIN;
ALTER TABLE telebirr_uat_funding
 ADD COLUMN sdk_app_id text,
 ADD COLUMN sdk_short_code text,
 ADD COLUMN sdk_timeout_express text,
 ADD COLUMN sdk_contract text,
 ADD CONSTRAINT telebirr_uat_sdk_context_valid CHECK (
  (sdk_app_id IS NULL AND sdk_short_code IS NULL AND sdk_timeout_express IS NULL AND sdk_contract IS NULL)
  OR (sdk_app_id IS NOT NULL AND sdk_short_code IS NOT NULL AND sdk_timeout_express IS NOT NULL AND sdk_contract IS NOT NULL
   AND sdk_app_id ~ '^[A-Za-z0-9]{1,32}$' AND sdk_short_code ~ '^[1-9][0-9]{1,15}$'
   AND sdk_timeout_express='120m' AND sdk_contract='inapp_create_order_v1' AND provider_reference IS NOT NULL
   AND provider_reference ~ '^[A-Za-z0-9]{1,128}$')
 );
CREATE FUNCTION public.telebirr_uat_sdk_context_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.sdk_contract IS NULL AND OLD.provider_reference IS NOT NULL AND NEW.sdk_contract IS NOT NULL THEN
  RAISE EXCEPTION 'Legacy preorder cannot acquire SDK context' USING ERRCODE='23514'; END IF;
 IF OLD.sdk_contract IS NOT NULL AND
  ROW(NEW.sdk_app_id,NEW.sdk_short_code,NEW.sdk_timeout_express,NEW.sdk_contract)
  IS DISTINCT FROM ROW(OLD.sdk_app_id,OLD.sdk_short_code,OLD.sdk_timeout_express,OLD.sdk_contract) THEN
  RAISE EXCEPTION 'Validated SDK context is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER telebirr_uat_sdk_context_immutable BEFORE UPDATE ON telebirr_uat_funding
 FOR EACH ROW EXECUTE FUNCTION public.telebirr_uat_sdk_context_guard();
COMMIT;
