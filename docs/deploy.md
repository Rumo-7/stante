# Deploy gratuito para os testadores

Arquitetura: **um serviço web no Render** (a API Node também entrega o front React
compilado), **banco no Neon** (PostgreSQL) e **anexos em um bucket S3-compatível**
(Cloudflare R2). Os três têm plano gratuito.

> Nunca cole senhas ou chaves em conversas, commits ou issues. Elas ficam só nos
> painéis dos serviços e no arquivo local `apps/api/.env.producao`, que o `.gitignore`
> já ignora.

## O que esperar do plano gratuito

- **O Render "dorme"** depois de 15 minutos sem acesso; a primeira visita seguinte leva
  de 30 a 60 segundos. Para testadores é aceitável; avise-os.
- **O Neon** suspende o banco depois de alguns minutos parado; a primeira consulta leva
  cerca de 1 segundo a mais.
- **O disco do Render é descartável**: por isso os anexos vão para o bucket, e a API
  recusa subir em produção com `STORAGE_DRIVER=disco`.
- Limites podem mudar; confira os planos atuais nos sites de cada serviço.

## 1. Banco (Neon)

1. Crie a conta em <https://neon.tech> e um projeto: nome `stante`, PostgreSQL 17,
   região **AWS US East (N. Virginia)**.
2. No painel do projeto, clique em **Connect** e copie a connection string **direta**
   (a que **não** tem `-pooler` no endereço).
3. Acrescente ao final dela `&connect_timeout=15&connection_limit=5`. Fica assim:
   `postgresql://usuario:senha@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=15&connection_limit=5`

## 2. Anexos (bucket S3-compatível)

Qualquer serviço S3-compatível serve. O roteiro abaixo é o do Cloudflare R2, que tem
10 GB gratuitos; **o Cloudflare pode pedir um cartão para ativar o R2** (sem cobrar
dentro do plano gratuito). Se você preferir não informar cartão, serviços como o
Backblaze B2 também falam o protocolo S3 e funcionam com o mesmo código: só mudam os
quatro valores abaixo.

1. Em <https://dash.cloudflare.com>, vá em **R2 Object Storage** e crie um bucket
   `stante-anexos`. Deixe-o **privado** (o padrão).
2. Em **R2 → Manage API Tokens → Create API token**: permissão **Object Read & Write**,
   restrita ao bucket `stante-anexos`.
3. Anote: **Access Key ID**, **Secret Access Key** e o endpoint
   `https://<id-da-conta>.r2.cloudflarestorage.com` (o id da conta aparece na tela do R2).

## 3. Preparar o banco (uma vez, da sua máquina)

O primeiro gestor e os dados de referência (órgãos e fiscais) são criados por script,
porque o plano gratuito do Render não tem terminal.

1. Crie o arquivo `apps/api/.env.producao` (ele é ignorado pelo git) com:

   ```
   DATABASE_URL="<a connection string do passo 1>"
   SEED_FISCAIS_EXEMPLO="nao"
   SEED_ADMIN_NOME="Nome do gestor"
   SEED_ADMIN_EMAIL="email-do-gestor@exemplo.com"
   SEED_ADMIN_SENHA="uma-senha-forte-de-verdade"
   ```

2. Com o Node carregado (`source dev.sh`), em `apps/api`:

   ```bash
   npm run db:deploy:producao   # cria as tabelas no Neon
   npm run db:seed:producao     # órgãos, fiscais e o primeiro gestor
   ```

3. Depois, apague o `.env.producao` (ou ao menos as linhas `SEED_ADMIN_*`). As contas de
   demonstração (`npm run db:seed:demo`) **não** devem ir para um ambiente público, a
   menos que você aceite que tenham senha conhecida.

## 4. Serviço web (Render)

1. Faça o push da branch para o GitHub (o `render.yaml` precisa estar no repositório).
2. Em <https://render.com>, crie a conta com o GitHub e escolha **New → Blueprint**.
   Conecte o repositório e a branch que contém o `render.yaml`.
   - Se o repositório é de uma organização e você não é administradora, o Render não
     enxerga o repo. Como o repositório é público, use **New → Web Service → Public Git
     Repository** com a URL dele (o build e o start são os mesmos do `render.yaml`); ou
     peça a quem administra a organização para autorizar o Render.
3. O Render lê o `render.yaml` e pergunta os valores marcados como secretos:
   `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
   Preencha com o que você anotou nos passos 1 e 2.
4. Aguarde o primeiro deploy (alguns minutos). Ao final o serviço mostra a URL pública,
   algo como `https://stante.onrender.com`.

## 5. Conferir o ambiente

1. `https://<sua-url>/api/health` deve responder `{"ok":true}`.
2. Entre com o gestor criado no passo 3.
3. Crie uma demanda com um PDF anexado, depois **baixe o anexo de volta**.
4. Confira que o arquivo apareceu no bucket (painel do R2).
5. No painel do Render, faça **Manual Deploy → Restart** e baixe o anexo de novo. Se
   baixar, os anexos sobrevivem a reinícios (o que provaria que não estão no disco).
6. Cadastre uma conta nova pela tela de cadastro e aprove-a na tela **Usuários**.

## Problemas comuns

- **Build falha com "tsc: not found"**: o build precisa das dependências de
  desenvolvimento; o `render.yaml` já usa `npm ci --include=dev`.
- **A API não sobe e o log lista "Variáveis de ambiente inválidas"**: falta alguma das
  variáveis acima, ou `STORAGE_DRIVER` não é `s3`.
- **Login funciona e a próxima tela volta ao login**: confira se o acesso é por
  `https://` (o cookie de sessão é `Secure` em produção).
- **Primeiro acesso lento**: é o plano gratuito acordando.
