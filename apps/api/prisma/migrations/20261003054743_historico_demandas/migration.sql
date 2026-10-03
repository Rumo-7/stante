-- CreateEnum
CREATE TYPE "TipoHistorico" AS ENUM ('criada', 'validada', 'status_alterado', 'reaberta', 'fiscal_alterado', 'prazo_alterado', 'assunto_alterado', 'anexo_adicionado', 'anexo_removido');

-- CreateTable
CREATE TABLE "historico_demandas" (
    "id" SERIAL NOT NULL,
    "demanda_id" INTEGER NOT NULL,
    "autor_id" INTEGER,
    "tipo" "TipoHistorico" NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_demandas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_demandas_demanda_id_created_at_idx" ON "historico_demandas"("demanda_id", "created_at");

-- AddForeignKey
ALTER TABLE "historico_demandas" ADD CONSTRAINT "historico_demandas_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_demandas" ADD CONSTRAINT "historico_demandas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
