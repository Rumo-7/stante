-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('aguardando_validacao', 'demanda_validada', 'demanda_atribuida', 'demanda_reaberta', 'prazo_critico', 'prazo_vencido');

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "demanda_id" INTEGER,
    "tipo" "TipoNotificacao" NOT NULL,
    "chave" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacoes_user_id_lida_em_created_at_idx" ON "notificacoes"("user_id", "lida_em", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notificacoes_user_id_demanda_id_tipo_chave_key" ON "notificacoes"("user_id", "demanda_id", "tipo", "chave");

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
