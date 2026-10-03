-- CreateEnum
CREATE TYPE "OrigemDemanda" AS ENUM ('planejada', 'campo');

-- AlterEnum
ALTER TYPE "StatusDemanda" ADD VALUE 'em_analise';

-- AlterTable
ALTER TABLE "demandas" ADD COLUMN     "criada_por_id" INTEGER,
ADD COLUMN     "origem" "OrigemDemanda" NOT NULL DEFAULT 'planejada',
ADD COLUMN     "validada_em" TIMESTAMP(3),
ADD COLUMN     "validada_por_id" INTEGER;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_criada_por_id_fkey" FOREIGN KEY ("criada_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_validada_por_id_fkey" FOREIGN KEY ("validada_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
