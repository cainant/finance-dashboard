# Desenvolvimento local

Este guia cobre o ambiente de desenvolvimento do Lumen Finance: requisitos, variáveis locais, banco D1, portas, testes e os problemas mais comuns no Windows. Para a visão de arquitetura, leia [`architecture.md`](./architecture.md); para deploy, [`deploy.md`](./deploy.md).

## Requisitos

| Ferramenta | Versão | Observação |
| --- | --- | --- |
| Node.js | 24 (`.nvmrc`) | `node -v` deve mostrar `v24.x` |
| pnpm | 12 (`packageManager: pnpm@12.14.0`) | `corepack enable` habilita a versão do repo |
| Git | recente | necessário para o fluxo de branches/PRs |
| Navegador | Chromium/Chrome | o Playwright baixa o Chromium usado nos E2E |

No Windows não há dependência de Python. Os scripts do repositório são Node/TypeScript.

```powershell
corepack enable
node -v
pnpm -v
```

Se `corepack` não estiver disponível, instale o pnpm 12 globalmente (`npm install -g pnpm@12`) e confirme a versão.

## Instalação

Em um clone normal:

```bash
pnpm install
```

Em um worktree criado pelo `wt` (T3/Claude/Cursor), rode uma vez:

```bash
wt setup .
```

Ele copia `.dev.vars`/`.env` quando existem, instala dependências se o lockfile mudou e prepara o ambiente. Este repositório usa portas fixas (veja abaixo); se o `wt` gerar um `.wt.env` com portas, ele não altera os scripts do Vite/Wrangler por conta própria.

## Variáveis de ambiente locais

O Worker lê secrets de `apps/api/.dev.vars` (o arquivo fica ao lado de `wrangler.jsonc` e é ignorado pelo Git). Crie a partir do exemplo:

```powershell
# Windows PowerShell
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
```

```bash
# bash / Git Bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

O modo demonstração funciona com o arquivo vazio. Os campos existentes são:

```dotenv
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
PLUGGY_WEBHOOK_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

- **Pluggy:** necessário apenas para o sandbox/MeuPluggy. Veja [`open-finance.md`](./open-finance.md).
- **GitHub OAuth:** não é necessário no dia a dia; o login por senha é habilitado em desenvolvimento. O fluxo OAuth local exige um callback público e não é o caminho recomendado para desenvolver.
- **Webhook:** o segredo local pode ser qualquer string; ele só é usado se você criar um webhook apontando para a máquina local (normalmente via túnel).

`apps/api/wrangler.jsonc` define os `vars` de desenvolvimento (`APP_ENV=development`, `ENABLE_DEMO_PROVIDER=true`, `ENABLE_PASSWORD_LOGIN=true`, `ALLOWED_GITHUB_LOGINS=`). Se você mudar esses valores para produção no `wrangler.jsonc` (veja [`deploy.md`](./deploy.md)), mantenha o comportamento local sobrescrevendo no `.dev.vars`:

```dotenv
APP_ENV=development
ENABLE_DEMO_PROVIDER=true
ENABLE_PASSWORD_LOGIN=true
ALLOWED_GITHUB_LOGINS=
```

No `wrangler dev`, valores do `.dev.vars` têm precedência sobre os `vars` de nível superior do `wrangler.jsonc`.

## Banco D1 local

As migrations ficam em `packages/database/migrations` e são aplicadas pelo Wrangler no estado local (Miniflare), sem tocar no D1 remoto.

```bash
pnpm db:migrate:local   # wrangler d1 migrations apply DB --local
pnpm db:seed:local      # aplica packages/database/seed.sql
```

O seed é idempotente (`INSERT OR IGNORE`) e cria:

- usuário demo `demo@finance.local` / `demo1234`;
- categorias de sistema (mercado, restaurantes, transporte, moradia, salário etc.);
- nenhuma conta/transação: esses dados vêm da sincronização do `DemoProvider` quando você conecta a demonstração pelo app.

### Resetar o banco local

Pare o `pnpm dev` antes (no Windows, o arquivo do D1 local pode ficar bloqueado). Depois apague o estado local e recrie:

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force apps/api/.wrangler/state
pnpm db:migrate:local
pnpm db:seed:local
```

```bash
# bash / Git Bash
rm -rf apps/api/.wrangler/state
pnpm db:migrate:local
pnpm db:seed:local
```

O diretório `apps/api/.wrangler/` é ignorado pelo Git. Se quiser inspecionar dados sem apagar tudo:

```powershell
pnpm --filter @fd/api exec wrangler d1 execute DB --local --command "SELECT email, name FROM users;"
```

Para criar uma migration nova depois de alterar o schema em `packages/database/src/schema.ts`:

```bash
pnpm --filter @fd/database db:generate
pnpm db:migrate:local
```

## Rodando o app

```bash
pnpm dev
```

O Turborepo sobe os dois processos:

| Serviço | URL | Comando isolado |
| --- | --- | --- |
| Web (Vite) | `http://127.0.0.1:5173` | `pnpm --filter @fd/web dev` |
| API (Wrangler) | `http://127.0.0.1:8787` | `pnpm --filter @fd/api dev` |

O Vite faz proxy de `/api` para `http://127.0.0.1:8787`, então o navegador enxerga uma origem só e o cookie de sessão funciona como em produção. Health check:

```powershell
curl.exe http://127.0.0.1:8787/api/health
# {"status":"ok","env":"development"}
```

No PowerShell, `curl` sozinho é alias de `Invoke-WebRequest`; use `curl.exe` para o comportamento esperado.

### Login demo

1. Abra `http://127.0.0.1:5173`.
2. Entre com `demo@finance.local` / `demo1234`.
3. Vá em **Conexões** e use **Conectar demonstração**.

O `DemoProvider` é determinístico e offline. Ele cria instituições fictícias, contas, cartões, faturas e cerca de 12 meses de transações assim que a conexão demo é sincronizada (conforme arquitetura). Tudo que vem dele aparece com o selo **Demonstração**.

## Testes

```bash
pnpm test        # unitários (Vitest) em todos os pacotes
pnpm test:e2e    # Playwright: sobe API + web se ainda não estiverem rodando
```

Primeira execução do Playwright:

```bash
pnpm --filter @fd/web exec playwright install chromium
```

O Playwright usa `http://localhost:5173` como baseURL e reutiliza servidores já em execução fora do CI. Se você estiver com `pnpm dev` aberto, ele reaproveita; no CI, sobe tudo do zero e roda com um worker.

Para rodar um arquivo específico:

```powershell
pnpm --filter @fd/web exec playwright test e2e/smoke.spec.ts
```

Screenshots de revisão são geradas sob demanda (veja [`design-system.md`](./design-system.md#screenshots-de-revisão)):

```powershell
$env:CAPTURE_SCREENSHOTS = "1"
pnpm --filter @fd/web exec playwright test e2e/screenshots.spec.ts
Remove-Item Env:CAPTURE_SCREENSHOTS
```

## Qualidade antes do PR

O fluxo obrigatório do repositório está em [`AGENTS.md`](../AGENTS.md). Antes de abrir PR, rode:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Se mexer no web ou na API, rode também `pnpm test:e2e`. O CI repete esses passos.

## Troubleshooting (Windows)

### `localhost` não responde, mas `127.0.0.1` sim

No Windows, `localhost` pode resolver para `::1` (IPv6) enquanto o Vite escuta em `127.0.0.1`. Use `http://127.0.0.1:5173`. O `apps/web/vite.config.ts` já define `server.host = "127.0.0.1"` por esse motivo.

### Porta ocupada (`EADDRINUSE`)

Descubra o processo e encerre:

```powershell
Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
Stop-Process -Id <PID> -Force
```

Troque `8787` por `5173` para o Vite. Evite rodar dois `pnpm dev` no mesmo worktree.

### `pnpm` não encontrado ou versão errada

```powershell
corepack enable
corepack prepare pnpm@12.14.0 --activate
pnpm -v
```

Se o Corepack estiver bloqueado por política da máquina, instale `npm install -g pnpm@12`.

### `EPERM` / erro de symlink no `pnpm install`

O pnpm usa links simbólicos. Ative o **Modo de Desenvolvedor** do Windows (Configurações → Sistema → Para desenvolvedores) ou rode o terminal com permissão adequada. Não use `--ignore-scripts`: o repositório já declara os builds permitidos em `pnpm-workspace.yaml`.

### `workerd` ou `esbuild` não instalam

```powershell
pnpm rebuild workerd esbuild
pnpm install
```

Se persistir, apague `node_modules` e o store local do pnpm e reinstale.

### D1 local “database is locked” ou schema estranho

Pare todos os processos de `wrangler dev`/`pnpm dev`, apague `apps/api/.wrangler/state` e rode migrations + seed de novo. Não edite o arquivo SQLite à mão.

### `.dev.vars` não é lido

Confirme que o arquivo está em `apps/api/.dev.vars` (não na raiz) e que o Wrangler foi iniciado a partir de `apps/api` — os scripts do repo já fazem isso. Variáveis de ambiente do sistema não são injetadas no Worker por padrão.

### Playwright: browser não encontrado

```powershell
pnpm --filter @fd/web exec playwright install chromium
```

No CI o cache de `~/.cache/ms-playwright` é reutilizado; localmente, a primeira execução baixa o Chromium.

### `format:check` falha por line endings

O Prettier está configurado com `endOfLine: "lf"`. Se o Git estiver convertendo para CRLF, ajuste o clone:

```powershell
git config core.autocrlf false
pnpm format
```

### Firewall do Windows

Na primeira execução, o Windows pode pedir permissão para Node/Wrangler aceitar conexões. Permita apenas em redes privadas; o app local não precisa ficar exposto na rede.

### Cache do Turborepo com resultado estranho

```powershell
pnpm exec turbo run build --force
```

Ou apague `.turbo/` na raiz e no pacote afetado.
