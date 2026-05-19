-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enabled_protocols" JSONB NOT NULL DEFAULT '["hysteria"]';
