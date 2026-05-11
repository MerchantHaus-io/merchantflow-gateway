ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS pricing_plan text,
  ADD COLUMN IF NOT EXISTS gateway_tier text;

CREATE OR REPLACE FUNCTION public.validate_opportunity_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pricing_plan IS NOT NULL
     AND NEW.pricing_plan NOT IN ('flat_rate','interchange_plus') THEN
    RAISE EXCEPTION 'Invalid pricing_plan: %', NEW.pricing_plan;
  END IF;
  IF NEW.gateway_tier IS NOT NULL
     AND NEW.gateway_tier NOT IN ('foundation','growth','scale','enterprise') THEN
    RAISE EXCEPTION 'Invalid gateway_tier: %', NEW.gateway_tier;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_opportunity_pricing ON public.opportunities;
CREATE TRIGGER trg_validate_opportunity_pricing
  BEFORE INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.validate_opportunity_pricing();

UPDATE public.opportunities o
SET gateway_tier = CASE
  WHEN sub.v <= 50000 THEN 'foundation'
  WHEN sub.v <= 100000 THEN 'growth'
  ELSE 'scale'
END
FROM (
  SELECT DISTINCT ON (ac.id) ac.id AS account_id,
    NULLIF(regexp_replace(coalesce(m.monthly_volume,''), '[^0-9.]', '', 'g'), '')::numeric AS v
  FROM public.accounts ac
  JOIN public.applications a ON (
    lower(coalesce(a.company_name,'')) = lower(coalesce(ac.name,''))
    OR lower(coalesce(a.dba_name,'')) = lower(coalesce(ac.name,''))
  )
  JOIN public.merchants m ON m.application_id = a.id
  WHERE m.monthly_volume IS NOT NULL
  ORDER BY ac.id, a.created_at DESC
) sub
WHERE o.account_id = sub.account_id
  AND o.gateway_tier IS NULL
  AND sub.v IS NOT NULL;