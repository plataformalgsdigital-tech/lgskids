-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "identity_user_estado" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "access_country" (
    "code" CHAR(2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "access_role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "access_role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "access_user_role" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "country_code" CHAR(2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_user" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "email_sintetico" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT NOT NULL,
    "estado" "identity_user_estado" NOT NULL DEFAULT 'ACTIVO',
    "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_login_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "identity_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "motivo_revoque" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_login_attempt" (
    "id" BIGSERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "exito" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "payload" JSONB,
    "correlation_id" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_role_code_key" ON "access_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "access_permission_code_key" ON "access_permission"("code");

-- CreateIndex
CREATE INDEX "access_user_role_user_id_idx" ON "access_user_role"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_user_role_user_id_role_id_country_code_key" ON "access_user_role"("user_id", "role_id", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "identity_user_username_key" ON "identity_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "identity_refresh_token_token_hash_key" ON "identity_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "identity_refresh_token_user_id_idx" ON "identity_refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "identity_refresh_token_family_id_idx" ON "identity_refresh_token"("family_id");

-- CreateIndex
CREATE INDEX "identity_refresh_token_expira_en_idx" ON "identity_refresh_token"("expira_en");

-- CreateIndex
CREATE INDEX "identity_login_attempt_username_created_at_idx" ON "identity_login_attempt"("username", "created_at");

-- CreateIndex
CREATE INDEX "identity_login_attempt_ip_created_at_idx" ON "identity_login_attempt"("ip", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidad_id_created_at_idx" ON "audit_log"("entidad", "entidad_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_accion_created_at_idx" ON "audit_log"("accion", "created_at");

-- AddForeignKey
ALTER TABLE "access_role_permission" ADD CONSTRAINT "access_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "access_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_role_permission" ADD CONSTRAINT "access_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "access_permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_user_role" ADD CONSTRAINT "access_user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_user_role" ADD CONSTRAINT "access_user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "access_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_user_role" ADD CONSTRAINT "access_user_role_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "access_country"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_refresh_token" ADD CONSTRAINT "identity_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
