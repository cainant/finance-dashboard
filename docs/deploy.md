# Deploy no plano gratuito

Passo a passo para colocar o Lumen Finance em produção usando **somente recursos gratuitos** da Cloudflare: Workers Free, Pages Free, D1 Free e KV Free. Nenhum passo exige cartão de crédito, Workers Paid, Queues ou R2. A Pluggy também tem caminho gratuito (sandbox e MeuPluggy); veja [`open-finance.md`](./open-finance.md).

> Este documento é um roteiro manual para o **primeiro** provisionamento. Nada aqui cria recursos automaticamente. Depois disso, o workflow [`deploy.yml`](../.github/workflows/deploy.yml) publica sozinho a cada merge na `main` com CI verde, e também aceita execução manual.

## Visão do que será criado

```
navegador
   │  https://<dominio>
   ▼
Cloudflare Pages (finance-dashboard-web)
   ├── assets estáticos de apps/web/dist
   └── /api/*  → Pages Function (functions/api/[[path]].ts)
                     │ service binding "API"
                     ▼
             Worker finance-dashboard-api  →  D1 (DB)
                     │                        KV (CACHE)
                     ├── GitHub OAuth
                     └── Pluggy API
```

- **Worker `finance-dashboard-api`**: Hono, API REST em `/api`, sessão em D1, Cron Trigger de 6h.
- **Pages `finance-dashboard-web`**: SPA + Pages Function que mantém a mesma origem do cookie.
- **D1 `finance-dashboard`**: schema e dados.
- **KV `CACHE`**: cache de leitura (por exemplo, apiKey da Pluggy), nunca escrita por request.

O frontend e a API compartilham a mesma origem em produção. É isso que faz o cookie `fd_session` funcionar sem CORS.

## Pré-requisitos

| Item | Observação |
| --- | --- |
| Conta Cloudflare | Plano Free, sem cartão. O primeiro deploy pode pedir verificação de e-mail. |
| Node 24 + pnpm 12 | Mesmos requisitos do desenvolvimento local. |
| Repositório clonado | `pnpm install` já executado. |
| Conta GitHub | Para criar a OAuth App e ser o único login autorizado. |
| Conta Pluggy | Opcional. Necessária para sandbox/MeuPluggy. O modo demo funciona sem ela. |
| Domínio próprio | Opcional. `*.pages.dev` funciona para OAuth, cookies e webhook (HTTPS). |

Autentique o Wrangler no navegador:

```bash
pnpm --filter @fd/api exec wrangler login
pnpm --filter @fd/api exec wrangler whoami
```

Em CI/CD, use `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` em vez do login interativo. Nunca commite tokens.

## Passo 1 — Criar o banco D1

```bash
cd apps/api
pnpm exec wrangler d1 create finance-dashboard
```

A saída traz um bloco parecido com:

```toml
[[d1_databases]]
binding = "DB"
database_name = "finance-dashboard"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copie o `database_id` para o seu `apps/api/.env.deploy` local (gitignored, modelo em `apps/api/.env.deploy.example`) e para o secret `CLOUDFLARE_D1_DATABASE_ID` no GitHub Actions. Mantenha o placeholder `00000000-0000-0000-0000-000000000000` no `apps/api/wrangler.jsonc` versionado: o script `apps/api/scripts/with-prod-wrangler.mjs` injeta o ID em tempo de deploy.

```dotenv
CLOUDFLARE_D1_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Conferir:

```bash
pnpm exec wrangler d1 list
pnpm exec wrangler d1 info finance-dashboard
```

No Free, cada conta tem até 10 bancos D1 e 500 MB por banco; este app usa uma fração mínima disso.

## Passo 2 — Criar o namespace KV

```bash
cd apps/api
pnpm exec wrangler kv namespace create CACHE
```

A saída traz um `id` (32 caracteres hexadecimais). Preencha `CLOUDFLARE_KV_NAMESPACE_ID` em `apps/api/.env.deploy` (local) e no secret `CLOUDFLARE_KV_NAMESPACE_ID` do GitHub Actions:

```dotenv
CLOUDFLARE_KV_NAMESPACE_ID=abcdef0123456789abcdef0123456789
```

Conferir:

```bash
pnpm exec wrangler kv namespace list
```

O KV é usado apenas como cache de leitura com TTL (por exemplo, a apiKey temporária da Pluggy). O Free permite 100.000 leituras/dia, 1.000 escritas/dia e 1 GB; por isso o app nunca escreve no KV a cada request.

## Passo 3 — Aplicar as migrations no D1 remoto

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote
```

Confirme com `y` quando o Wrangler perguntar. As migrations vêm de `packages/database/migrations` (o `migrations_dir` já aponta para lá) e o controle fica na tabela `d1_migrations`.

Verificar:

```bash
pnpm exec wrangler d1 migrations list DB --remote
pnpm exec wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

Você deve ver tabelas como `users`, `sessions`, `connections`, `accounts`, `transactions`, `categories`, `investments`, `sync_runs` e `settings`.

As migrations incluem `0003_remove_demo_connections.sql` (remove conexões demo antigas; em produção já não há dados demo) e `0004_meu_pluggy_accounts_consent.sql` (`accounts.institution_name` para bancos diferentes no MeuPluggy e `connections.consent_expires_at`).

**Não rode o seed em produção.** `packages/database/seed.sql` cria o usuário demo local (`demo@finance.local`), e em produção o login é por GitHub OAuth. O D1 Free guarda backups do Time Travel por 7 dias; para um backup manual, veja `wrangler d1 export` na seção de troubleshooting.

> Cuidado com `--local` x `--remote`: sem `--remote`, o Wrangler mexe apenas no banco local de desenvolvimento.

## Passo 4 — Configurar as variáveis de produção

Em `apps/api/wrangler.jsonc`, o bloco `env.production.vars` já define:

```jsonc
"vars": {
  "APP_ENV": "production",
  "ENABLE_DEMO_PROVIDER": "false",
  "ENABLE_PASSWORD_LOGIN": "false",
},
```

- `APP_ENV=production` ativa o comportamento de produção (cookie `Secure`, por exemplo).
- `ENABLE_PASSWORD_LOGIN=false` é obrigatório: PBKDF2 não cabe nos 10 ms de CPU do Workers Free. Em produção o login é só GitHub OAuth.
- `ALLOWED_GITHUB_LOGINS` fica como **secret do Worker** em produção (`pnpm --filter @fd/api exec wrangler secret put ALLOWED_GITHUB_LOGINS --env production`) para não expor os logins autorizados no repositório público. Recebe seu login do GitHub (ou uma lista separada por vírgula, sem espaços). Só esses logins entram.
- `ENABLE_DEMO_PROVIDER=false` em produção: a instância é exclusivamente de dados reais. O provider demo continua disponível em desenvolvimento/testes (o e2e depende dele). Com `false`, `POST /api/connections` com `provider: "demo"` é rejeitado e `/api/providers` não lista demo.

Se você também desenvolve na mesma máquina depois disso, sobrescreva no `apps/api/.dev.vars`:

```dotenv
APP_ENV=development
ENABLE_DEMO_PROVIDER=true
ENABLE_PASSWORD_LOGIN=true
ALLOWED_GITHUB_LOGINS=
```

Detalhes de todas as variáveis em [`environment-variables.md`](./environment-variables.md).

## Passo 5 — Deploy do Worker

```bash
cd apps/api
pnpm exec wrangler deploy
```

A saída mostra o nome `finance-dashboard-api` e, se `workers_dev` estiver habilitado, uma URL `https://finance-dashboard-api.<seu-subdominio>.workers.dev`. Teste:

```bash
curl.exe https://finance-dashboard-api.<seu-subdominio>.workers.dev/api/health
# {"status":"ok","env":"production"}
```

Se você ainda não configurou os secrets da Pluggy/GitHub, o Worker sobe normalmente; os endpoints que dependem deles respondem como indisponíveis até a configuração (conforme arquitetura).

## Passo 6 — Criar o projeto Pages e fazer o primeiro deploy

Crie o projeto uma única vez (Direct Upload). O comando usa o Wrangler instalado em `@fd/api`; rode da raiz:

```bash
pnpm --filter @fd/api exec wrangler pages project create finance-dashboard-web --production-branch main
```

Gere o build:

```bash
pnpm --filter @fd/web build
```

Confirme que `apps/web/dist/index.html` existe. Faça o deploy apontando o `--cwd` para `apps/web`, que é onde estão o `wrangler.jsonc` do Pages e a pasta `functions/`:

```bash
pnpm --filter @fd/api exec wrangler pages deploy dist \
  --cwd ../../apps/web \
  --project-name finance-dashboard-web \
  --branch main
```

A saída traz a URL de produção, algo como `https://finance-dashboard-web.pages.dev` (ou com sufixo aleatório se o nome já existir). Abra no navegador: a SPA deve carregar.

> O `wrangler pages deploy` envia o conteúdo de `dist` **e** a pasta `functions/`, além de aplicar o `wrangler.jsonc` do projeto. Não use arrastar-e-soltar no dashboard: ele não compila Pages Functions com a pasta `functions`.

## Passo 7 — Service binding `API` no Pages

O binding já está declarado em `apps/web/wrangler.jsonc`:

```jsonc
"services": [{ "binding": "API", "service": "finance-dashboard-api" }],
```

Como esse arquivo tem `pages_build_output_dir` e é a fonte da verdade do projeto Pages, o `wrangler pages deploy` aplica o binding. Confira no dashboard: **Workers & Pages → finance-dashboard-web → Settings → Bindings** deve existir `API` apontando para `finance-dashboard-api`.

Se você criou o projeto pelo dashboard ou por Git integration, adicione manualmente:

1. **Settings → Bindings → Add → Service binding**.
2. Variable name: `API`.
3. Service: `finance-dashboard-api`.
4. **Save** e faça um novo deploy (o binding só entra em uma nova versão).

Teste pela origem do Pages, não pela URL do Worker:

```bash
curl.exe https://<dominio>/api/health
# {"status":"ok","env":"production"}
```

Se `/api/health` retornar 404/500, o binding está ausente ou apontando para o nome errado. O nome do serviço é `finance-dashboard-api`, não o nome do projeto Pages.

## Passo 8 — Domínio (opcional)

Pode usar a URL `*.pages.dev` para tudo (OAuth, cookie e webhook). Para um domínio próprio:

1. **Workers & Pages → finance-dashboard-web → Custom domains → Set up a domain**.
2. Informe, por exemplo, `finance.seudominio.com`.
3. O domínio precisa estar na mesma conta Cloudflare; o Pages cria o CNAME e o certificado automaticamente.
4. Espere o status **Active** e confirme que `https://finance.seudominio.com` abre.
5. Use sempre o mesmo host (com ou sem `www`): trocar de host invalida o cookie de sessão.

O certificado e o HTTPS são gratuitos. O cookie de sessão é `Secure` em produção, então **use HTTPS** (pages.dev e domínio próprio já vêm com TLS).

## Passo 9 — GitHub OAuth App

1. No GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Preencha:
   - **Application name:** `Lumen Finance`
   - **Homepage URL:** `https://<dominio>`
   - **Authorization callback URL:** `https://<dominio>/api/auth/github/callback`
3. **Register application**.
4. Copie o **Client ID**.
5. Clique em **Generate a new client secret** e copie o valor imediatamente (ele não aparece de novo).

O callback tem que ser exatamente `https://<dominio>/api/auth/github/callback`, com HTTPS e sem barra no final. A Pages Function encaminha `/api/*` para o Worker, então o callback passa pela mesma origem do site.

Configure os secrets no Worker:

```bash
cd apps/api
pnpm exec wrangler secret put GITHUB_CLIENT_ID --env production
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --env production
pnpm exec wrangler secret put ALLOWED_GITHUB_LOGINS --env production
```

O `wrangler secret put` pede o valor de forma interativa (não passe o segredo como argumento, para não ficar no histórico do shell). Em `ALLOWED_GITHUB_LOGINS`, informe seu login do GitHub (ou uma lista separada por vírgula, sem espaços). Como ele é secret (e não está em `env.production.vars`), os próximos deploys preservam o valor.

Teste em `https://<dominio>/login`: o botão de GitHub deve redirecionar, autorizar e voltar com sessão. Se o login autenticar mas não entrar, verifique se o `login` do GitHub está na allowlist. Para conferir o usuário autenticado: `GET https://<dominio>/api/auth/me`.

Não é preciso marcar escopos adicionais: o app lê o perfil público (`/user`) para obter `login`, nome e avatar.

## Passo 10 — Primeiro acesso e conexão MeuPluggy

1. Abra `https://<dominio>`; você deve cair em `/login`.
2. Entre com GitHub. Se o login não estiver em `ALLOWED_GITHUB_LOGINS`, o acesso é negado.
3. Antes de conectar no Lumen, autorize seus bancos em <https://meu.pluggy.ai> (cada banco é uma
   autorização separada).
4. No Dashboard da Pluggy, com a mesma conta do Meu Pluggy, confirme que o conector **MeuPluggy**
   está habilitado (**Customization → Connectors → Direct Connectors → Personal**).
5. No Lumen, vá em **Conexões → Conectar MeuPluggy**, entre com a conta do Meu Pluggy e autorize.
   O app registra o(s) item(ns) e sincroniza contas, cartões, faturas, investimentos e transações.
6. Se preferir, use a opção avançada e cole um `itemId` copiado do Dashboard.

O passo a passo completo, com consentimento de 1 ano, reconexão e limitações, está em
[`open-finance.md`](./open-finance.md#4-meupluggy-dados-reais-pessoais-produção).

> A produção roda com `ENABLE_DEMO_PROVIDER=false`. Não há "Conectar demonstração" na UI; o modo
> demo existe apenas em desenvolvimento/testes.

O endpoint `POST /api/auth/setup` é do fluxo de senha e não deve ser usado em produção com `ENABLE_PASSWORD_LOGIN=false`. O primeiro usuário de produção nasce pelo OAuth.

### Instalar no celular (PWA)

O app é instalável (manifest + ícones, sem service worker; ver
`docs/decisions/2026-11-14-pwa-instalavel-sem-service-worker.md`). Não há passo de deploy extra:
`public/manifest.webmanifest` e `public/icons/` saem junto com o Pages. Depois do deploy, confira que
`/manifest.webmanifest` responde JSON e instale pelo celular (iOS: Safari → Compartilhar → Adicionar à
Tela de Início; Android: Chrome → Instalar app). **Teste o login com GitHub dentro do app instalado**
(passo a passo na decisão): é o ponto que não dá para validar fora de um aparelho.

## Passo 11 — Webhook da Pluggy

O webhook é necessário para o app receber atualizações de conexões reais sem polling. Use o webhook **global** (`POST /webhooks`), que assina todos os itens e aceita o header secreto.

### 11.1 Configurar os secrets da Pluggy

No [dashboard da Pluggy](https://dashboard.pluggy.ai), crie/abra a aplicação e copie **Client ID** e **Client Secret**. Depois, em `apps/api`:

```bash
pnpm exec wrangler secret put PLUGGY_CLIENT_ID
pnpm exec wrangler secret put PLUGGY_CLIENT_SECRET
pnpm exec wrangler secret put PLUGGY_WEBHOOK_SECRET
```

Para o segredo do webhook, gere uma string aleatória longa:

```bash
node -p "require('crypto').randomBytes(32).toString('base64url')"
```

Guarde o valor: ele será usado no header `X-Webhook-Secret` ao criar o webhook na Pluggy. O Worker compara esse header com `PLUGGY_WEBHOOK_SECRET`.

### 11.2 Registrar o webhook global (idempotente)

A Pluggy **não assina webhooks com HMAC**. O caminho suportado é criar o webhook via `POST /webhooks` com `headers` customizados, checar `clientId` e sempre re-buscar o recurso no provider. O script abaixo lista os webhooks existentes, atualiza o da mesma URL com `PATCH` ou cria com `POST`; ele nunca imprime segredos.

```bash
cd apps/api
# dev: --env-file lê PLUGGY_CLIENT_ID/SECRET/WEBHOOK_SECRET do .dev.vars
node --env-file=.dev.vars scripts/register-pluggy-webhook.mjs

# produção: exporte as variáveis no shell e aponte a URL pública
export PLUGGY_CLIENT_ID=...
export PLUGGY_CLIENT_SECRET=...
export PLUGGY_WEBHOOK_SECRET=...
export PLUGGY_WEBHOOK_URL=https://<dominio>/api/webhooks/pluggy
node scripts/register-pluggy-webhook.mjs
```

`APP_URL=https://<dominio>` também funciona (o script acrescenta `/api/webhooks/pluggy`). A URL precisa ser **HTTPS**; localhost não é aceito pela Pluggy.

Conferir os webhooks existentes (sem imprimir o segredo):

```bash
curl https://api.pluggy.ai/webhooks -H "X-API-KEY: <PLUGGY_API_KEY>"
```

> O header customizado só funciona em webhooks criados por `POST /webhooks`. `webhookUrl` em Item ou Connect Token **não** envia headers. O `POST /api/providers/pluggy/connect-token` do Lumen não define `webhookUrl`, justamente para não duplicar eventos.

### 11.3 Validar o endpoint

Sem o header, o endpoint deve recusar:

```bash
curl.exe -i -X POST https://<dominio>/api/webhooks/pluggy -H "Content-Type: application/json" -d "{}"
# HTTP/1.1 401 ...
```

Com um evento real da Pluggy, o app valida o segredo, confere o `clientId`, responde 2xx rápido e re-busca o item/transações antes de sincronizar. `transactions/deleted` apaga localmente os ids informados. Acompanhe os logs do Worker no dashboard em **Workers & Pages → finance-dashboard-api → Logs**.

### 11.4 Sandbox e MeuPluggy

- **MeuPluggy (produção):** é o caminho gratuito para dados reais pessoais (até 5 conexões, consentimento de 1 ano). Conecte pelo botão **Conectar MeuPluggy** ou cole um `itemId` na opção avançada. O item pertence ao Meu Pluggy/Dashboard; o app registra a conexão.
- **Sandbox (dev/teste):** use o conector **Pluggy Bank**, com `user-ok` / `password-ok` e MFA `123456`. O id do conector deve ser resolvido por `GET /connectors?sandbox=true`; não hardcode. O botão do app em produção é restrito ao MeuPluggy.

O passo a passo completo, com limitações e erros, está em [`open-finance.md`](./open-finance.md).

## Passo 12 — Cron Trigger

O agendamento já está no `apps/api/wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["0 */6 * * *"],
},
```

O `wrangler deploy` aplica o Cron Trigger. Confira em **Workers & Pages → finance-dashboard-api → Settings → Triggers → Cron Triggers**. Mudanças de cron podem levar até 15 minutos para propagar.

No Free:

- até **5 Cron Triggers por conta**;
- **10 ms de CPU por execução** de cron;
- a sincronização real roda de forma incremental, com orçamento de subrequests e continuação no próximo ciclo (conforme arquitetura). Não há Queues: o trabalho é feito inline com `ctx.waitUntil`.

Se o volume crescer, prefira aumentar a janela/continuar no próximo cron a rodar tudo em uma única execução.

## Passo 13 — Deploy pelo GitHub Actions

O workflow [`deploy.yml`](../.github/workflows/deploy.yml) roda em dois modos:

- **automático**, quando o CI termina verde num push para a `main` (`workflow_run`): faz checkout do mesmo commit que passou no CI e publica migrations, Worker e site;
- **manual** (`workflow_dispatch`), quando você quer escolher o que publicar.

Um commit cujo **assunto** (primeira linha) traz `[skip deploy]` não dispara o deploy automático (útil para PR que só mexe em documentação). O resto da mensagem não conta: o merge com squash junta os corpos dos commits, e um corpo que cite o marcador não pode desligar o deploy.

Para habilitar:

1. Crie um API Token na Cloudflare com os escopos da seção [CI/CD de environment-variables.md](./environment-variables.md#cicd-github-actions).
2. Descubra o Account ID:

   ```bash
   pnpm --filter @fd/api exec wrangler whoami
   ```

3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_D1_DATABASE_ID`
   - `CLOUDFLARE_KV_NAMESPACE_ID`
   - `PROD_URL` (opcional; ex.: `https://seu-dominio.exemplo`, usada no `agent-cli smoke prod` após o deploy)
4. Opcional: rode **Actions → Deploy (produção) → Run workflow**, escolha a branch `main` e os passos desejados (migrations, API, web).
5. O workflow:
   - avisa com `::warning::` e **pula o deploy** se os secrets obrigatórios estiverem ausentes (o CI continua verde);
   - espera o CI do commit ficar verde antes de publicar;
   - instala dependências, roda o build, aplica migrations remotas (`pnpm run db:migrate:remote`), faz deploy da API (`pnpm run deploy`), `wrangler pages deploy` do web e roda `agent-cli smoke prod` (quando `PROD_URL` está configurado);
   - dois deploys nunca rodam ao mesmo tempo (`concurrency: deploy-production`, sem cancelar o que já está no ar): merges seguidos entram em fila.

O workflow assume que D1, KV, o Worker e o projeto Pages já existem (passos 1–7). Ele não substitui o primeiro deploy manual nem cria o projeto Pages.

Se precisar voltar uma versão: rode `pnpm deploy:prod` localmente a partir do commit bom (com `apps/api/.env.deploy` preenchido), ou faça revert na `main` (o merge do revert publica sozinho).

### Token do CI e renovação

O deploy automático usa os secrets do repositório, não o `wrangler login` da máquina:

| Secret | Para que serve |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | User API Token com escopo mínimo de deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID da conta Cloudflare (`wrangler whoami`) |
| `CLOUDFLARE_D1_DATABASE_ID` | UUID do banco D1 de produção (`wrangler d1 list`) |
| `CLOUDFLARE_KV_NAMESPACE_ID` | ID do namespace KV de produção (`wrangler kv namespace list`) |
| `PROD_URL` | Origem pública de produção (opcional, usada no smoke pós-deploy) |

Escopos mínimos do token (conta inteira, sem zona): **Workers Scripts: Edit**, **Cloudflare Pages: Edit**, **D1: Edit**, **Workers KV Storage: Edit**, **Account Settings: Read**.

Defina validade no token e **renove antes de expirar**: **My Profile → API Tokens → Roll** (gera um valor novo com os mesmos escopos) ou crie outro token com os mesmos escopos, depois rode `gh secret set CLOUDFLARE_API_TOKEN` (o comando pede o valor; não passe como argumento). Sem isso, a cada push na `main` o passo de migrations falha com `Authentication error [code: 10000]` — token expirado deixa o run vermelho; secret ausente apenas pula o deploy com `::warning::` e o run fica verde.

## Passos que só o dono faz

Cada um exige sessão ou consentimento humano; o agente pede o handoff em vez de tentar contornar.

| Passo | Por quê |
| --- | --- |
| `wrangler login` | OAuth da Cloudflare no navegador. O token do login **não** tem DNS Edit: para domínio próprio, crie o CNAME no dashboard (Cloudflare → DNS) ou use um API Token com **Zone → DNS: Edit**. |
| Gerar o client secret do GitHub OAuth App | O GitHub pede *sudo mode* (reautenticação). |
| Login no dashboard do Pluggy | Conta e 2FA do dono. |
| Autorizar bancos em meu.pluggy.ai e "Conectar MeuPluggy" | Consentimento Open Finance pessoal (1 ano, até 5 conexões). |

Depois de qualquer deploy: `pnpm smoke:prod` (já roda ao fim de `pnpm deploy:prod` e ao fim do deploy do workflow). Contra o sandbox do Pluggy: `pnpm smoke:pluggy`.

## Limites do plano Free e como o app se mantém dentro deles

| Recurso | Limite no Free | Como o Lumen Finance se mantém |
| --- | --- | --- |
| Workers — requisições | 100.000/dia | App pessoal, poucas sessões; assets estáticos não passam pelo Worker; o frontend usa cache do TanStack Query e não faz polling agressivo. |
| Workers — CPU | 10 ms por request (HTTP e cron) | Produção sem PBKDF2 (login GitHub OAuth); agregações e somas em SQL; sem processamento pesado de JSON no Worker. |
| Workers — subrequests | 50 por invocação; 6 conexões simultâneas | Sync paginado com orçamento, `ctx.waitUntil` e continuação no próximo cron; chamadas Pluggy sequenciais/limitadas; webhook responde 2xx e re-busca só o necessário. |
| Cron Triggers | 5 por conta; 10 ms de CPU por execução | Um único cron a cada 6h; sync incremental desde `last_synced_at − 7 dias`; se não terminar, continua no próximo ciclo. |
| D1 | 5 milhões de linhas lidas/dia; 100.000 escritas/dia; 5 GB; 10 bancos | Um banco pequeno; índices em `(user_id, date)`, `(account_id, date)` e categoria; upserts idempotentes; snapshots diários em vez de varreduras completas. |
| KV | 100.000 leituras/dia; 1.000 escritas/dia; 1 GB | Só cache de leitura com TTL (apiKey da Pluggy); nenhuma escrita por request; nenhum contador de rate limit no KV (fica no D1). |
| Pages | 500 builds/mês; requests estáticos ilimitados; 20.000 arquivos; 25 MiB/arquivo | Direct Upload em cada merge na `main` (uma build por deploy) e no deploy manual; SPA pequena; sem Git integration do Pages, que buildaria a cada push. |
| Pages Functions | Requisições contam na cota de Workers | A Pages Function só encaminha `/api/*`; assets não passam por ela. |
| GitHub Actions (repo privado) | 2.000 minutos/mês | Dois jobs em paralelo (`checks` e `e2e` em 2 shards), cache do pnpm e do Turborepo, Playwright só Chromium; deploy separado, depois do CI verde na `main`. |
| Pluggy | Sandbox gratuito; Development com 100 itens; 360 req/min por endpoint; MeuPluggy até 5 conexões | Sandbox para desenvolvimento; MeuPluggy para dados reais pessoais; sync de 6h, sem polling; sem uso comercial. |
| Cloudflare Access | Até 50 usuários no Free (opcional) | Camada extra opcional; não é obrigatória para o app funcionar e pode exigir método de pagamento cadastrado. |

O que **não** usamos de propósito: Workers Paid, Queues, R2, Durable Objects pagos, Cron com CPU alta, builds pagos do Pages e qualquer produto que exija cartão.

## Checklist de segurança

- [ ] `ENABLE_PASSWORD_LOGIN=false` em produção; login só por GitHub OAuth.
- [ ] `ENABLE_DEMO_PROVIDER=false` em produção; nenhuma conexão demo e nenhum CTA/selo demo na UI.
- [ ] `ALLOWED_GITHUB_LOGINS` preenchido com os logins corretos (comparação de lista, sem espaços).
- [ ] GitHub OAuth App com callback exato `https://<dominio>/api/auth/github/callback`; conta com 2FA.
- [ ] Secrets apenas via `wrangler secret put` ou `.dev.vars` local; nada de segredo em `wrangler.jsonc`, README ou logs.
- [ ] `PLUGGY_WEBHOOK_SECRET` longo e aleatório; webhook global registrado via `POST /webhooks` (script idempotente) com o header; endpoint responde `401` sem o segredo.
- [ ] Webhook valida `clientId` e **sempre** re-busca o recurso na Pluggy; nunca confia no payload; `transactions/deleted` apaga os ids locais.
- [ ] MeuPluggy conectado pelo widget restrito ao conector 200; consentimento (`consentExpiresAt`) visível.
- [ ] Cookie de sessão `HttpOnly`, `Secure` em produção, `SameSite=Lax`, `Path=/`; mesma origem (Pages + service binding).
- [ ] `apps/web/public/_headers` publicado no Pages: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`; confira os headers no domínio após o deploy.
- [ ] Opcional: `workers_dev: false` no `wrangler.jsonc` para o Worker não ser acessível fora do Pages. O service binding continua funcionando.
- [ ] Rate limit de login por senha em D1 (`login_attempts`) e, se quiser, Cloudflare Rate Limiting na rota de login.
- [ ] Cloudflare Access (opcional, Free até 50 usuários): se ativar na frente do domínio, crie **bypass** para `/api/auth/github/callback` e `/api/webhooks/pluggy`, senão o OAuth e a Pluggy são bloqueados. Access pode exigir método de pagamento cadastrado; trate como camada extra, não como substituto da auth do app.
- [ ] `PLUGGY_CLIENT_SECRET` nunca vai para o browser; só o connect token vai para o widget.
- [ ] Logs sem dados financeiros ou PII; erros registram código/`x-request-id`, não payload de transação.
- [ ] D1 com Time Travel (7 dias no Free); export periódico se quiser retenção maior.
- [ ] CI verde antes do merge; deploy automático a partir da `main`; branch `main` protegida; sem force-push.
- [ ] Dados demo sempre rotulados **Demonstração**; nunca apresentar dado fictício como real.

## Troubleshooting de deploy

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `Authentication error [code: 10000]` | Token inválido/sem permissão, expirado ou conta errada | Confira `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`; rode `wrangler whoami`; renove o token de deploy (ver [Token do CI e renovação](#token-do-ci-e-renovação)). |
| `D1 database ... not found` | `database_id` placeholder ou de outra conta | Rode `wrangler d1 list` e atualize `CLOUDFLARE_D1_DATABASE_ID` (secret do CI ou `apps/api/.env.deploy`). |
| `No migrations to apply` | Migrations já aplicadas | Confira `wrangler d1 migrations list DB --remote`; não reaplique à força. |
| `wrangler pages deploy` pergunta o projeto | Projeto ainda não existe | Rode `wrangler pages project create finance-dashboard-web --production-branch main` ou passe `--project-name`. |
| `/api/health` 404/500 no domínio Pages | Binding `API` ausente/errado | Confira Settings → Bindings; o serviço deve ser `finance-dashboard-api`; redeploy do Pages. |
| `redirect_uri_mismatch` no GitHub | Callback diferente do cadastrado | Use exatamente `https://<dominio>/api/auth/github/callback`, HTTPS e sem barra final. |
| Login GitHub autentica mas não entra | Login fora da allowlist | Atualize o secret `ALLOWED_GITHUB_LOGINS` com `wrangler secret put ALLOWED_GITHUB_LOGINS --env production`. |
| Cookie não persiste | Host diferente (`www` vs apex) ou HTTP | Use o mesmo host e HTTPS; o cookie é `Secure` em produção. |
| Webhook responde 401 | `x-webhook-secret` ausente/diferente | Regenere o segredo, atualize no Worker e recrie o webhook na Pluggy com o mesmo header. |
| Webhook responde 404 | URL errada | Deve ser `https://<dominio>/api/webhooks/pluggy`, no domínio do Pages. |
| Cron não dispara | Propagação ou CPU | Espere até 15 min; confira Settings → Triggers; lembre do limite de 10 ms de CPU no Free. |
| `wrangler pages deploy` envia build antigo | `dist` não foi regerado | Rode `pnpm --filter @fd/web build` antes do deploy. |
| Migrations foram para o banco local | Faltou `--remote` | Repita com `wrangler d1 migrations apply DB --remote`. |
| Precisa de backup do D1 | Time Travel de 7 dias no Free | Use `wrangler d1 export finance-dashboard --remote --output backup.sql` (e guarde fora do Git). |

## Referências oficiais

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) e [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [KV limits](https://developers.cloudflare.com/kv/platform/limits/)
- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Pluggy — MeuPluggy para uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)
- [Pluggy — sandbox](https://docs.pluggy.ai/en/docs/guides/sandbox)
- [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/)

## Resumo da topologia de produção

| Item | Configuração |
| --- | --- |
| Frontend | Cloudflare Pages `finance-dashboard-web` (`*.pages.dev` ou domínio próprio proxied) |
| API | Worker `finance-dashboard-api`, ambiente `production` em `apps/api/wrangler.jsonc` (`workers_dev: false`; acessível só pelo service binding da Pages Function) |
| D1 | `finance-dashboard` (ID injetado via `CLOUDFLARE_D1_DATABASE_ID`) |
| KV | `CACHE` (ID injetado via `CLOUDFLARE_KV_NAMESPACE_ID`) |
| Login | GitHub OAuth App (callback `https://<dominio>/api/auth/github/callback`), allowlist no secret `ALLOWED_GITHUB_LOGINS`; senha desabilitada |
| Dados | `ENABLE_DEMO_PROVIDER=false`; somente MeuPluggy (dados reais). Migration `0003` remove conexões demo antigas. |
| Secrets do Worker | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_GITHUB_LOGINS`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET` |
| Secrets do CI | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_KV_NAMESPACE_ID`, `PROD_URL` (opcional) |
| Webhook | Global `POST /webhooks` para `https://<dominio>/api/webhooks/pluggy`, evento `all`, header `X-Webhook-Secret`; registre/atualize com `apps/api/scripts/register-pluggy-webhook.mjs` |
| Cron | `0 */6 * * *` |

Redeploy manual (com `wrangler login` e `apps/api/.env.deploy` preenchido) — o merge na `main` com CI verde já publica sozinho:

```bash
pnpm deploy:prod   # build + migrations remotas + Worker (--env production) + Pages + smoke
```

Em produção, sem login por senha, o primeiro usuário é criado no primeiro login pelo GitHub (`setupRequired` fica `false`).
