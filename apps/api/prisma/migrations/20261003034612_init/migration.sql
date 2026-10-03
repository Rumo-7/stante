-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('gestor', 'inspetor', 'representante');

-- CreateEnum
CREATE TYPE "StatusDemanda" AS ENUM ('aberta', 'em_andamento', 'concluida');

-- CreateEnum
CREATE TYPE "TipoDemandante" AS ENUM ('ministerio_publico', 'judiciario', 'sindicato', 'controle_social', 'fiscalizacao', 'saude', 'cidadao', 'outro');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscais" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "especialidade" TEXT,

    CONSTRAINT "fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandantes" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoDemandante" NOT NULL DEFAULT 'outro',

    CONSTRAINT "demandantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandas" (
    "id" SERIAL NOT NULL,
    "demandante_id" INTEGER NOT NULL,
    "fiscal_id" INTEGER,
    "assunto" TEXT NOT NULL,
    "prazo" DATE NOT NULL,
    "status" "StatusDemanda" NOT NULL DEFAULT 'aberta',
    "concluida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demandas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" SERIAL NOT NULL,
    "demanda_id" INTEGER NOT NULL,
    "nome_original" TEXT NOT NULL,
    "chave_arquivo" TEXT NOT NULL,
    "mime_type" TEXT,
    "tamanho" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "demandantes_nome_key" ON "demandantes"("nome");

-- CreateIndex
CREATE INDEX "demandas_prazo_idx" ON "demandas"("prazo");

-- CreateIndex
CREATE INDEX "demandas_status_idx" ON "demandas"("status");

-- CreateIndex
CREATE INDEX "demandas_fiscal_id_idx" ON "demandas"("fiscal_id");

-- CreateIndex
CREATE INDEX "demandas_demandante_id_idx" ON "demandas"("demandante_id");

-- CreateIndex
CREATE INDEX "anexos_demanda_id_idx" ON "anexos"("demanda_id");

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_demandante_id_fkey" FOREIGN KEY ("demandante_id") REFERENCES "demandantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_fiscal_id_fkey" FOREIGN KEY ("fiscal_id") REFERENCES "fiscais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
