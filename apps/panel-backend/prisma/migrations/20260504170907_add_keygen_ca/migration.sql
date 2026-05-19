-- CreateTable
CREATE TABLE "keygen_ca" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cert_pem" TEXT NOT NULL,
    "private_key_pem" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keygen_ca_pkey" PRIMARY KEY ("id")
);
