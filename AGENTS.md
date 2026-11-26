# AGENTS.md — regras para agentes neste repositório

Leia `docs/architecture.md` (fonte da verdade) antes de qualquer alteração. Pesquisa de suporte em `docs/research/`. Decisões recentes, uma por arquivo, em `docs/decisions/`.

**Use `./bin/agent-cli` primeiro** (`agent-cli --help`): ele responde fatos de produção, portas, PRs, verificação, D1 e smoke tests num lugar só. Prefira-o a reler arquivos ou adivinhar comandos.

## Restrição de custo zero

Somente free tiers (Workers Free 10 ms CPU/request, Pages, D1, KV free, GitHub Free, Pluggy sandbox/MeuPluggy). Sem cartão, Workers Paid, Queues ou R2. Threads não fazem deploy nem criam recursos na Cloudflare: o deploy é do dono (`docs/deploy.md`, `pnpm deploy:prod`).

## Ambiente

- Windows, sem Python (use `node` para scripts). pnpm 12, Node 24, TypeScript 6.0.3 (pinado), TanStack Table **v9** (API nova — use os docs v9 e as skills em `.agents/skills/`).
- Você está num worktree próprio. Rode `wt setup .` uma vez no início (copia `.env`/`.dev.vars`, instala deps, aloca portas sem conflito em `.wt.env`). Use as portas do `.wt.env` ao subir servidores (`E2E_API_PORT`/`E2E_WEB_PORT` no e2e) e encerre-os ao terminar; `agent-cli ports --kill` limpa sobras.
- Dependências: adicione só no pacote que precisa (`pnpm --filter @fd/<pkg> add <dep>`). Versões compartilhadas via `catalog:` em `pnpm-workspace.yaml`.
- Provider demo existe só em dev e e2e; produção roda sem ele (`ENABLE_DEMO_PROVIDER=false`).
- Provider real (Pluggy): valide mudanças com `agent-cli smoke pluggy` e guarde respostas reais como fixtures em `packages/financial-providers/test/fixtures/`. Mocks escritos à mão já esconderam bugs reais.

## Fluxo de entrega (obrigatório)

1. Comece de `origin/main` atualizado (`git fetch origin && git rebase origin/main`) e trabalhe numa branch própria (`feat/<slug>`), commits pequenos (Conventional Commits) terminados com `Co-Authored-By: DeepSeek V4.1 via OpenCode <noreply@opencode.ai>`.
2. Faça commit e `git push` a cada etapa verde: uma thread pode cair a qualquer momento e o que não foi enviado fica só no worktree.
3. Antes de abrir PR, deixe verde `agent-cli verify` (mesmos checks do CI); some `--only e2e` se mexer em web/api. Quem muda um contrato da API atualiza os e2e no mesmo PR.
4. `git fetch origin && git rebase origin/main` antes de abrir/atualizar o PR. Conflito em `pnpm-lock.yaml`: aceite o de `origin/main` e rode `pnpm install`.
5. Abra o PR com `gh pr create --base main`: o que mudou, como foi testado, saídas reais dos comandos; termine com `🤖 Generated with DeepSeek V4.1 via OpenCode`.
6. Acompanhe o CI: `gh pr checks <n> --watch --fail-fast`. Falhou: `gh run view <run-id> --log-failed`, corrija, push, repita.
7. Você está autorizado a fazer o merge do seu próprio PR com todos os checks verdes e a branch atualizada com `main`: `gh pr merge <n> --squash --delete-branch`.
8. Decisão nova (regra de negócio, contrato, cálculo, escolha entre alternativas) vira **um arquivo próprio** em `docs/decisions/` (`docs/decisions/_template.md`), nunca uma linha nova no registro de `docs/architecture.md`: assim dois PRs abertos ao mesmo tempo não conflitam no mesmo parágrafo. Decisão estrutural também referencia um ADR em `docs/adr/`.
9. Tarefas com partes independentes viram vários PRs menores, cada um por esse fluxo.

## Concorrência e memória

Vários worktrees rodando vitest, Playwright, wrangler e vite ao mesmo tempo esgotam a memória virtual do Windows. Isso derrubou o banco do T3 (`SQLITE_IOERR`) e interrompeu threads.

- No máximo **2 threads** com trabalho pesado (testes, e2e, servidores) ao mesmo tempo; abra a próxima só quando uma terminar.
- Antes de uma rodada de testes, confira a memória virtual livre em GB (`[math]::Round((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1MB,1)`); abaixo de ~4, espere ou feche processos.
- Durante o trabalho, rode só os testes do que você mudou (`vitest run <arquivo>`); o `agent-cli verify` completo roda uma vez antes do PR. O e2e completo fica para o CI; localmente use `--workers=1`, nas portas do `.wt.env`.
- Encerre os servidores que subiu e remova worktrees de revisão ao terminar.

## Git e worktrees

- Não use `git stash` (nem `pop`/`drop`) em nenhuma thread. A lista de stash é compartilhada por todos os worktrees do repo: já houve `pop` que aplicou o stash de outra thread e misturou alterações de PRs diferentes.
- Para trocar de base ou isolar alterações, faça commit em branch própria ou use cópia em temporário fora do repo.
- Nunca apague branch ou worktree com alterações não commitadas.

## Testes

- Para provar que um teste fica vermelho sem a correção, copie o arquivo de `src` para um temporário fora do repo, reverta-o, rode o teste e restaure a cópia. Não use `git stash`.

## Subagentes

Lance subagentes do **mesmo modelo** (DeepSeek V4.1 via OpenCode, ferramenta nativa de subagente/task) para partes independentes, em paralelo, cada um com escopo de arquivos disjunto. Você integra, revisa, deixa o CI verde e faz o merge.

## Qualidade

- Relate a saída real dos testes.
- Segredos só em `.dev.vars` (gitignored; mantenha `.dev.vars.example`) ou em secrets do Worker.
- Logs sem dados financeiros ou pessoais.
