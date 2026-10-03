-- AlterTable
ALTER TABLE "anexos" ADD COLUMN     "enviado_por_id" INTEGER;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
