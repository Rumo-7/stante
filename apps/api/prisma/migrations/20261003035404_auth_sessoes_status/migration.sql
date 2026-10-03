/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `fiscais` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('pendente', 'ativo', 'bloqueado');

-- AlterTable
ALTER TABLE "fiscais" ADD COLUMN     "user_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "demandante_id" INTEGER,
ADD COLUMN     "status" "StatusUsuario" NOT NULL DEFAULT 'pendente';

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessoes_user_id_idx" ON "sessoes"("user_id");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes"("expira_em");

-- CreateIndex
CREATE UNIQUE INDEX "fiscais_user_id_key" ON "fiscais"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_demandante_id_fkey" FOREIGN KEY ("demandante_id") REFERENCES "demandantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscais" ADD CONSTRAINT "fiscais_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
