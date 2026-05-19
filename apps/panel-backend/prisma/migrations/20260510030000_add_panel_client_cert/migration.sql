-- Slice S6 — separate panel-client cert (clientAuth-only) so the CA
-- private key no longer participates in TLS handshakes.
ALTER TABLE "keygen_ca" ADD COLUMN "panel_client_cert_pem" TEXT;
ALTER TABLE "keygen_ca" ADD COLUMN "panel_client_key_pem" TEXT;
-- Backfill happens lazily in bootstrapCa() the next time the panel boots:
-- if a row has cert/key but no panelClient*, we generate the leaf there
-- (Node webcrypto isn't available in pure SQL).
