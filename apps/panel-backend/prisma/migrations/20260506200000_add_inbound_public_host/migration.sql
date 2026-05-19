-- Slice 25: split the public client-URL host from the mTLS control-plane
-- endpoint. Until now `inbounds` rows reused `node.address` for the URI
-- emitted to clients, which forced admins to put a public FQDN there even
-- though that string is also the panel→node mTLS target — meaning a domain
-- change broke the cert SAN and required a Refresh-bootstrap dance.
-- Both columns nullable: NULL preserves the legacy fallback to node.address.

ALTER TABLE "inbounds"
  ADD COLUMN "public_host" VARCHAR(253),
  ADD COLUMN "public_port" INTEGER;
