-- CreateEnum
CREATE TYPE "notifications_canal" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "notifications_estado" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "notifications_outbox" (
    "id" UUID NOT NULL,
    "canal" "notifications_canal" NOT NULL,
    "destinatario" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "payload" JSONB,
    "estado" "notifications_estado" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "enviada_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_object" (
    "id" UUID NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "subido_por" UUID NOT NULL,
    "entidad" TEXT,
    "entidad_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_object_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_outbox_estado_created_at_idx" ON "notifications_outbox"("estado", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_object_storage_key_key" ON "files_object"("storage_key");

-- CreateIndex
CREATE INDEX "files_object_entidad_entidad_id_idx" ON "files_object"("entidad", "entidad_id");
