-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoHistorico" ADD VALUE 'novo_ciclo';
ALTER TYPE "TipoHistorico" ADD VALUE 'ciclo_vinculado';

-- AlterTable
ALTER TABLE "demandas" ADD COLUMN     "demanda_origem_id" INTEGER;

-- CreateIndex
CREATE INDEX "demandas_demanda_origem_id_idx" ON "demandas"("demanda_origem_id");

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_demanda_origem_id_fkey" FOREIGN KEY ("demanda_origem_id") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
