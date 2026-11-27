-- AlterTable
ALTER TABLE "demandas" ADD COLUMN     "processo_sei" TEXT,
ADD COLUMN     "recebida_em" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "demandas_processo_sei_key" ON "demandas"("processo_sei");
