-- B3 / G (2026-06-14): self-steal domain + node hardening toggles.
-- domain: FQDN the operator A-records to THIS node's IP. REALITY serverName for
--   self-steal profiles deployed here (SNI resolves to the node IP), later ACME.
-- hardening: flexible jsonb of probe-resistance flags (ufwLockdown, fail2ban,
--   realisticFallback, ...). Json so new toggles add without a migration.
ALTER TABLE "nodes" ADD COLUMN "domain" VARCHAR(255);
ALTER TABLE "nodes" ADD COLUMN "hardening" JSONB;
