-- CreateTable
CREATE TABLE "relatorios" (
    "id" SERIAL NOT NULL,
    "periodo_de" DATE NOT NULL,
    "periodo_ate" DATE NOT NULL,
    "fatos" JSONB NOT NULL,
    "texto" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER,
    "tokens_saida" INTEGER,
    "conferencia" JSONB NOT NULL DEFAULT '[]',
    "gerado_por_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relatorios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relatorios_created_at_idx" ON "relatorios"("created_at");

-- AddForeignKey
ALTER TABLE "relatorios" ADD CONSTRAINT "relatorios_gerado_por_id_fkey" FOREIGN KEY ("gerado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
