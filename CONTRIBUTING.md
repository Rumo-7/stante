# Como contribuir com o Stante

Obrigado por contribuir! Este guia é para a equipe **RUMO 7** e explica como preparar o ambiente, desenvolver, testar e levar uma mudança até a produção.

Ficou com alguma dúvida ou achou algo desatualizado aqui? Fale com o time ou abra um PR corrigindo este arquivo.

## Índice

- [Links importantes](#links-importantes)
- [Convivência](#convivência)
- [Onde pedir ajuda](#onde-pedir-ajuda)
- [Formas de contribuir](#formas-de-contribuir)
- [Preparando o ambiente](#preparando-o-ambiente)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Escolhendo o que fazer](#escolhendo-o-que-fazer)
- [Fluxo de trabalho](#fluxo-de-trabalho)
- [Commits](#commits)
- [Padrões de código](#padrões-de-código)
- [Banco de dados e migrações](#banco-de-dados-e-migrações)
- [Testes e verificação](#testes-e-verificação)
- [Pull Requests](#pull-requests)
- [Revisão e merge](#revisão-e-merge)
- [Publicando em produção](#publicando-em-produção)
- [Reportando bugs](#reportando-bugs)
- [Sugerindo melhorias](#sugerindo-melhorias)
- [Segurança e dados](#segurança-e-dados)
- [Reconhecimento](#reconhecimento)

## Links importantes

| O que | Onde |
|---|---|
| Visão geral do projeto | [README](README.md) |
| Backlog e sprints | [Board no ClickUp](https://sharing.clickup.com/90171494885/b/h/5-901710774440-2/e2df639a3523910) |
| Bugs e melhorias técnicas | [Issues do repositório](https://github.com/Rumo-7/stante/issues) |
| Publicação e problemas de deploy | [docs/deploy.md](docs/deploy.md) |
| Aplicação no ar | [Demo](https://stante-2tm9.onrender.com/login) |

## Convivência

- Trate todas as pessoas do time com respeito.
- Na revisão, comente sobre o código, não sobre quem o escreveu. Explique o motivo do que pedir.
- Dúvidas são bem-vindas, em qualquer nível de experiência.
- Avise cedo quando travar ou quando não for conseguir entregar uma tarefa, para o time se reorganizar.
- Em trabalho em pair programming, registre a dupla na seção [Pair Programming](README.md#pair-programming) do README.

## Onde pedir ajuda

- **Sobre uma tarefa:** comente no card correspondente no ClickUp.
- **Sobre um PR:** comente no próprio PR.
- **Dúvida geral ou problema para montar o ambiente:** pergunte ao time. Em caso de erro, envie o comando, a mensagem, o sistema operacional e as versões do Node e do npm, sem senhas ou chaves.
- **Acesso ao Space "RUMO 7" no ClickUp:** peça a um PM da equipe.
- **Quem faz o quê:** veja os papéis no [Hall of Fame](README.md#hall-of-fame).

## Formas de contribuir

Programar é só uma delas. Testes, documentação e relatos bem escritos também fazem parte do produto.

| Contribuição | Por onde começar | O que precisa instalar |
|---|---|---|
| Código: histórias e correções | [Escolhendo o que fazer](#escolhendo-o-que-fazer) | [Ambiente completo](#preparando-o-ambiente) |
| Corrigir ou melhorar a documentação | [README](README.md), este guia e a pasta `docs/` | Nada: dá para editar pelo próprio GitHub |
| Testar o sistema e relatar problemas | [Demo](https://stante-2tm9.onrender.com/login) e [Reportando bugs](#reportando-bugs) | Só o navegador |
| Reproduzir um bug já registrado | [Issues](https://github.com/Rumo-7/stante/issues): comente com os passos e o resultado | Só o navegador, se o problema aparecer na demo |
| Testar a acessibilidade | Tente concluir uma tarefa só com o teclado e registre as barreiras com a etiqueta `accessibility` | Só o navegador |
| Gravar os screencasts que faltam | [Histórias Implementadas](README.md#historias-implementadas) | Gravador de tela |

Mudanças em documentação também entram por [Pull Request](#pull-requests). Quem só edita texto não precisa montar o ambiente: confira a pré-visualização e os links.

## Preparando o ambiente

### Pré-requisitos

Obrigatórios para trabalhar no código:

- **Git**
- **Node.js 24** (a versão do [`.nvmrc`](.nvmrc), usada pelo CI e pela produção), com o **npm 11** que vem com ele
- **Docker** com Docker Compose, para o PostgreSQL de desenvolvimento e testes. Se preferir, use um PostgreSQL 16 ou 17 instalado na máquina
- Acesso ao Space "RUMO 7" no ClickUp

Opcional: uma chave da Groq, apenas para o parecer com IA.

### Passo a passo

Os comandos rodam na raiz do repositório, no terminal Bash ou no PowerShell.

```bash
git clone https://github.com/Rumo-7/stante.git
cd stante
git switch develop
npm ci

npm run db:up                             # sobe o PostgreSQL na porta 5433
cp apps/api/.env.example apps/api/.env    # defina SEED_ADMIN_SENHA (mínimo de 8 caracteres)

npm run db:generate -w @stante/api        # gera o cliente do Prisma
npm run db:migrate -w @stante/api         # cria ou atualiza as tabelas
npm run db:seed -w @stante/api            # dados de referência, fiscais de exemplo e o primeiro gestor
```

Depois, em dois terminais:

```bash
npm run dev:api    # API em http://127.0.0.1:4000
```

```bash
npm run dev:web    # aplicação em http://localhost:5173
```

### Conferindo se deu certo

1. <http://127.0.0.1:4000/api/health> responde com `"ok":true` e `"commit":"local"`.
2. <http://localhost:5173> mostra a tela de login.
3. Você consegue entrar com o e-mail e a senha definidos em `SEED_ADMIN_EMAIL` e `SEED_ADMIN_SENHA`.

### Observações

- **PostgreSQL sem Docker:** pule o `npm run db:up`, crie o banco `stante_dev` e ajuste usuário, senha e porta na `DATABASE_URL`.
- **Porta 5433 ocupada:** suba o banco com outra porta na variável `STANTE_DB_PORTA` e troque a porta também na `DATABASE_URL` do `.env` e do `.env.test`.
- **Parar o banco:** `npm run db:down`. Os dados continuam salvos.
- **Dados de demonstração (opcional):** defina `SEED_DEMO_SENHA` e rode `npm run db:seed:demo -w @stante/api`.
- **Sentinela (parecer com IA, opcional):** configure `GROQ_API_KEY` no `.env`, conforme as instruções do `.env.example`. Sem a chave, o restante do sistema funciona normalmente.

### Problemas comuns

| Sintoma | Solução |
|---|---|
| `typecheck` acusa que `@prisma/client` não exporta um tipo (`has no exported member`) | O cliente do Prisma não foi gerado ou está desatualizado: rode `npm run db:generate -w @stante/api` |
| Os testes param com `apps/api/.env.test não encontrado` | Siga [Preparando o banco de teste](#preparando-o-banco-de-teste) |
| A API não sobe e lista `Variáveis de ambiente inválidas` | Confira se o `apps/api/.env` existe e tem as variáveis apontadas na mensagem |
| A API ou os testes não conectam ao banco | Confira se o banco está no ar (`npm run db:up`) e se a porta da `DATABASE_URL` é a mesma do banco |

## Estrutura do projeto

É um monorepo com npm workspaces:

| Pasta | Conteúdo |
|---|---|
| `apps/api` | API em Node.js, Express 5, TypeScript, Prisma e PostgreSQL |
| `apps/web` | Interface em React, Vite e TanStack Query |
| `packages/shared` | Regras de prazo, schemas Zod e tipos usados pelos dois lados |
| `docs` | Documentação de publicação |
| `.github` | Workflows de CI e de verificação do deploy |

## Escolhendo o que fazer

- **Histórias de usuário:** ficam no board do ClickUp, nas colunas Backlog, Pendente, Em progresso, Review e Closed.
- **Bugs e melhorias técnicas:** ficam nas [issues](https://github.com/Rumo-7/stante/issues).

Antes de começar, confira se ninguém já está na tarefa, coloque-se como responsável e mova o card para **Em progresso**. Em issues, comente avisando que vai trabalhar nela.

Mudanças grandes, como novas regras de negócio, alterações no banco ou troca de bibliotecas, devem ser combinadas com o time **antes** da implementação.

## Fluxo de trabalho

Usamos duas branches permanentes:

| Branch | Função |
|---|---|
| `develop` | Integração. É de onde as branches de trabalho saem e para onde os PRs vão |
| `main` | Produção. Cada atualização é publicada no Render |

```
feature/... ──PR──▶ develop ──PR de release──▶ main ──▶ produção
```

Não faça push direto na `develop` nem na `main`: toda mudança entra por Pull Request.

### Criando a branch

```bash
git switch develop
git pull
git switch -c feature/UH13-fluxo-reversivel
```

| Tipo de trabalho | Nome da branch | Exemplo |
|---|---|---|
| História de usuário | `feature/UHx-descricao` | `feature/UH15-novo-ciclo` |
| Funcionalidade sem UH | `feature/descricao` | `feature/importacao-csv-demandas` |
| Correção | `fix/descricao` | `fix/constantes-compartilhadas` |
| CI e infraestrutura | `ci/descricao` | `ci/infra-qualidade` |
| Documentação | `docs/descricao` | `docs/guia-de-contribuicao` |

Use nomes curtos, sem acentos e com palavras separadas por hífen. Cada branch trata de um único assunto.

### Mantendo a branch atualizada

Se a `develop` avançar enquanto você trabalha, traga as mudanças para a sua branch, resolva os conflitos e rode os testes de novo:

```bash
git fetch origin
git merge origin/develop
```

## Commits

Seguimos o padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/), com mensagens em português:

```
tipo(escopo): descrição curta
```

| Tipo | Quando usar |
|---|---|
| `feat` | Funcionalidade nova ou mudança de comportamento |
| `fix` | Correção de bug |
| `test` | Criação ou ajuste de testes |
| `refactor` | Reorganização do código sem mudar o comportamento |
| `style` | Ajustes visuais ou de formatação |
| `docs` | Documentação |
| `ci` | Workflows e automações |
| `chore` | Configuração, dependências e manutenção |

O **escopo** é opcional e indica a história (`uh3`, `uh15`) ou a parte do sistema (`api`, `web`, `shared`).

Exemplos do próprio histórico:

```
feat(uh13): exige justificativa ao retornar etapa da demanda
fix(api): centraliza a validação de ID em utils/validacao
test(uh15): cobre a listagem de ciclos por perfil
docs: explica como diagnosticar deploy que não atualiza
```

- Escreva a descrição em minúsculas, sem ponto final, começando por um verbo no presente: "adiciona", "corrige", "mostra".
- Faça commits pequenos, cada um com uma mudança que faça sentido sozinha.
- Quando o motivo não for óbvio, explique no corpo do commit.
- Se o commit resolve uma issue, termine o corpo com `Closes #número`.

## Padrões de código

O projeto não tem linter nem formatador automático. Siga o estilo do código ao redor.

### Geral

- TypeScript em modo `strict`. Evite `any`.
- Indentação de 2 espaços, aspas simples, ponto e vírgula e vírgula no final de listas com várias linhas.
- Nomes do domínio e comentários em português (`demanda`, `fiscal`, `exigirPerfil`).
- Comentários explicam o **porquê** de uma decisão, não repetem o que o código faz.
- Regras e schemas usados pela API e pela interface ficam em `packages/shared`, sem duplicação.
- Antes de criar uma constante ou função utilitária, procure se ela já existe (por exemplo, `DIA_MS` e `ehIdValido` em `apps/api/src/utils`).

### API (`apps/api`)

- Cada área do sistema tem uma pasta em `src/modules/`, com as rotas em arquivos `*.routes.ts`.
- Valide a entrada com um schema Zod por meio de `validar()`.
- Para erros esperados, lance `ErroHttp`, com mensagem em português que possa ser mostrada a quem usa o sistema.
- Proteja as rotas conforme o perfil (gestor, inspetor ou representante). A permissão precisa valer na API, não apenas esconder o botão na tela.
- Valide os IDs recebidos na URL com `ehIdValido()`.

### Interface (`apps/web`)

- Chamadas à API ficam em `src/api/`, usando o TanStack Query.
- Telas ficam em `src/pages/` e componentes reutilizáveis em `src/components/`.
- Funções puras ficam em `src/util/`, com testes.
- Estilos ficam em `src/styles/`.

### Dependências

Instale a dependência no workspace que vai usá-la e inclua o `package-lock.json` no mesmo commit:

```bash
npm install nome-do-pacote -w @stante/web
```

## Banco de dados e migrações

1. Altere o `apps/api/prisma/schema.prisma`.
2. Crie a migração com um nome que descreva a mudança:
   ```bash
   npm run db:migrate -w @stante/api -- --name ciclos_da_demanda
   ```
3. Inclua no commit o `schema.prisma` e a pasta criada em `prisma/migrations/`.
4. Atualize o banco de teste com `npm run db:test:prepare -w @stante/api`.

- **Não edite nem apague uma migração que já está na `develop` ou na `main`.** Crie uma nova.
- A produção aplica as migrações pendentes quando a aplicação sobe, sobre um banco com dados. Evite mudanças que apaguem ou invalidem registros: prefira colunas que aceitem nulo ou tenham valor padrão.
- Avise no PR que há migração nova. Depois do merge, cada pessoa precisa rodar os comandos `db:migrate` e `db:test:prepare`.

## Testes e verificação

Usamos o [Vitest](https://vitest.dev). Os testes ficam ao lado do código, em arquivos `*.test.ts`.

### Preparando o banco de teste

Os testes de integração da API usam um banco separado.

> ⚠️ **Os testes apagam os dados do banco configurado no `.env.test`.** Nunca aponte esse arquivo para o banco de desenvolvimento ou de produção.

```bash
cp apps/api/.env.test.example apps/api/.env.test
npm run db:test:prepare -w @stante/api
```

Com o `npm run db:up`, o banco `stante_test` é criado automaticamente na primeira vez. Sem Docker, crie o banco e ajuste a `DATABASE_URL`.

### Durante o desenvolvimento

Antes de mudar o código, rode os testes da área em que vai trabalhar. Assim você distingue uma falha que já existia de uma que você causou.

```bash
npm test -w @stante/shared                                # regras compartilhadas, sem banco
npm test -w @stante/web                                   # utilitários da interface, sem banco
npm test -w @stante/api -- src/utils/validacao.test.ts    # um único arquivo da API
```

Mesmo para um único arquivo, os testes da API exigem o `.env.test`.

### Antes de abrir o PR

```bash
npm run typecheck    # verifica os tipos em todos os workspaces
npm test             # roda os testes de todos os workspaces
npm run build        # o mesmo build usado na produção
```

Para ver a cobertura, use `npm run test:cobertura`.

- Funcionalidade nova ou correção de bug deve vir com testes.
- Em rotas, teste o caminho de sucesso, os erros de validação e as permissões de cada perfil.
- Os testes não podem depender de serviços externos, como a IA ou o armazenamento S3.
- Mudou a interface? Teste no navegador também.

### Integração contínua

O workflow **CI** roda em todo PR para `develop` e `main` e a cada atualização da `develop`. O job `qualidade` verifica os tipos, faz o build, executa os testes e publica a cobertura no resumo da execução. **Não faça merge com o CI vermelho.**

## Pull Requests

1. Envie a branch: `git push -u origin nome-da-branch`.
2. Abra o PR com a **`develop` como destino**. O GitHub sugere a `main` por padrão, então troque a base.
3. Use um título no padrão dos commits, como `feat(uh13): fluxo reversível de etapas`.
4. Coloque no PR o link da tarefa do ClickUp ou a issue (`Closes #número`).
5. Mova o card para **Review**.

Prefira PRs pequenos e focados: não misture uma correção com formatação ou atualização de dependências que não sejam necessárias para ela. Se o trabalho ainda não estiver pronto, abra como **draft**.

Se algum teste falhar por um motivo alheio à sua mudança, informe no PR qual foi e o erro exato, em vez de dizer que tudo passou. Diga também o que você não conseguiu verificar.

> A issue só é fechada automaticamente quando o commit ou o PR com `Closes` chega à `main`.

### Descrição do PR

Copie e preencha:

```markdown
## O quê
O que muda e qual tarefa ou issue é atendida.

## Por quê
O problema que a mudança resolve.

## Como testar
Passo a passo para quem for revisar, com o perfil usado.

## Verificação
Resultado do typecheck, dos testes e do build. Prints, se a interface mudou.

## Banco de dados
Há migração nova? O que ela faz? (apague se não houver)

## Pontos para a revisão
Decisões tomadas e trechos que merecem atenção.
```

### Checklist

- [ ] A base do PR é a `develop`
- [ ] `npm run typecheck`, `npm test` e `npm run build` passam
- [ ] O comportamento novo ou corrigido tem testes
- [ ] Os critérios de aceite da tarefa foram atendidos
- [ ] A documentação foi atualizada, se necessário
- [ ] Nenhum segredo ou dado real foi incluído

## Revisão e merge

**Quem faz o merge é outra pessoa do time, nunca quem abriu o PR.**

Quem abre o PR:

- avisa o time que o PR está pronto para revisão e, se ninguém assumir, avisa de novo;
- responde aos comentários e envia os ajustes na mesma branch;
- se não puder terminar, avisa o time e deixa o PR como draft, explicando o que falta, para outra pessoa poder assumir.

Quem revisa:

- começa pela descrição: a mudança resolve o problema e faz sentido no projeto? Se a abordagem não servir, avisa logo;
- lê o código e, quando fizer sentido, roda a branch seguindo o "Como testar";
- confere se o CI está verde, se há testes, se a documentação acompanha a mudança e se as permissões e migrações estão corretas;
- reúne os comentários de uma vez e separa o que **impede o merge**, com o motivo, do que é **sugestão opcional**;
- deixa claro qual é o próximo passo de quem abriu o PR;
- quando estiver tudo certo, faz o merge com **Create a merge commit**.

Depois do merge, mova o card para **Closed**.

## Publicando em produção

A `develop` chega à produção por um PR de release.

1. Se a `main` tiver mudanças que não estão na `develop`, integre-as antes: crie `release/develop-para-main` a partir da `develop`, faça o merge da `main` nela, resolva os conflitos e abra um PR para a `develop`.
2. Abra um PR da `develop` para a `main`, com o título `release: promove develop para main (o que entra)`.
3. Na descrição, liste o que vai para produção, as migrações que serão aplicadas e o que testar depois do deploy.
4. Com o CI verde, outra pessoa do time faz o merge.
5. O Render publica a `main`. Acompanhe o workflow **Verificar deploy** na aba Actions: ele confere se o commit novo está no ar.
6. Teste na aplicação publicada o que foi listado no PR.

Se a produção não atualizar, siga [Quando o deploy não atualiza](docs/deploy.md#quando-o-deploy-não-atualiza).

## Reportando bugs

Procure primeiro nas [issues](https://github.com/Rumo-7/stante/issues), **abertas e fechadas**, se o problema já foi registrado. Se não, abra uma issue por problema, com o título `[BUG] descrição curta`, use a etiqueta `bug` e preencha:

```markdown
## Problema
O que está errado.

## Como reproduzir
1. Perfil usado e tela
2. Passos

## Esperado e obtido
O que deveria acontecer e o que aconteceu.

## Onde acontece
Ambiente (local ou produção), versão (o `commit` do `/api/health` ou do seu Git), navegador, rota ou arquivos.
Cole erros curtos como texto. Prints ajudam, mas não substituem a descrição. Remova dados pessoais e segredos.

## Por que é um problema
O impacto.

## Correção proposta
Opcional.
```

**Falhas de segurança:** o repositório é público. Não abra uma issue com os detalhes; avise um PM diretamente.

## Sugerindo melhorias

- **Funcionalidade:** proponha ao time como história de usuário no ClickUp, no padrão **3Cs** (Card, Conversation, Confirmation), com critérios de aceite.
- **Melhoria técnica:** abra uma issue com a etiqueta `enhancement`, explicando o problema e a proposta.

Comece pelo problema que precisa ser resolvido, e não por uma solução específica. Espere o time concordar antes de implementar.

## Segurança e dados

- Nunca versione arquivos `.env`, senhas, chaves ou tokens. Só os arquivos `.env.example` e `.env.test.example` vão para o repositório, sem segredos reais.
- Não cole credenciais em commits, issues, PRs, prints ou conversas. Isso inclui a URL do Deploy Hook do Render.
- Não use dados reais de pessoas ou casos de saúde do trabalhador em testes, seeds, prints ou na demo. Use dados fictícios.
- Se um segredo vazar, troque-o imediatamente e avise o time. Apagar o commit não basta.

## Reconhecimento

A equipe do Stante está no [Hall of Fame](README.md#hall-of-fame). Toda contribuição conta, com ou sem código. Obrigado por ajudar a construir o projeto!
