-- Partners must be able to see the deals belonging to accounts they referred.
-- Referral ownership is recorded on the account; opportunities under that
-- account inherit visibility.
CREATE POLICY "Referrers can view opportunities on their accounts"
ON public.opportunities
FOR SELECT
TO authenticated
USING (public.referrer_owns_account(account_id));

-- Backfill: copy the account's partner onto its deals where the deal has none.
UPDATE public.opportunities o
SET referrer_id = a.referrer_id
FROM public.accounts a
WHERE o.account_id = a.id
  AND a.referrer_id IS NOT NULL
  AND o.referrer_id IS NULL;