-- Preserve application IDs, inventory ownership and transaction foreign keys.
-- Link only unambiguous verified identities; never infer or change a role.
BEGIN;
ALTER TABLE public.users ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.users u SET auth_user_id=a.id FROM auth.users a WHERE u.user_id=a.id;
WITH candidates AS (
 SELECT u.user_id,a.id,
 count(*) OVER(PARTITION BY u.user_id) AS account_matches,
 count(*) OVER(PARTITION BY a.id) AS identity_matches
 FROM public.users u JOIN auth.users a
 ON u.phone_number='+'||ltrim(a.phone,'+')
 WHERE u.auth_user_id IS NULL AND a.phone IS NOT NULL AND a.phone<>''
 AND a.phone_confirmed_at IS NOT NULL AND u.role IN ('buyer','farmer')
 AND NOT EXISTS(SELECT 1 FROM auth.users prior WHERE prior.id=u.user_id)
 AND NOT EXISTS(SELECT 1 FROM public.users linked WHERE linked.auth_user_id=a.id)
)
UPDATE public.users u SET auth_user_id=c.id FROM candidates c
 WHERE u.user_id=c.user_id AND c.account_matches=1 AND c.identity_matches=1;

CREATE FUNCTION public.marketplace_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT user_id FROM public.users WHERE auth_user_id=auth.uid()
 OR (auth_user_id IS NULL AND user_id=auth.uid())
 ORDER BY (auth_user_id=auth.uid()) DESC NULLS LAST LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.marketplace_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_user_id() TO authenticated;
CREATE OR REPLACE FUNCTION public.marketplace_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.users WHERE user_id=public.marketplace_user_id() AND role='admin');
$$;
-- Same ownership/admin rules, now using the explicitly linked application ID.
ALTER POLICY users_read_secure ON public.users USING
 (user_id=public.marketplace_user_id() OR public.marketplace_is_admin());
ALTER POLICY listings_read ON public.produce_listings USING
 (deleted_at IS NULL AND (farmer_id=public.marketplace_user_id() OR status='available' OR public.marketplace_is_admin()));
ALTER POLICY transactions_read_secure ON public.transactions USING
 (buyer_id=public.marketplace_user_id() OR farmer_id=public.marketplace_user_id() OR public.marketplace_is_admin());
COMMIT;
