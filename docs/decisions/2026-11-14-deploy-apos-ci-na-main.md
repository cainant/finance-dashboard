# Deploy de produção depois do CI verde na main

- **Data:** 2026-11-14
- **PR:** #70 (CI em shards + deploy automático)

## Contexto

O `deploy.yml` era só `workflow_dispatch`: cada merge na `main` deixava a produção parada até alguém
rodar o workflow na mão ou `pnpm deploy:prod`. Na prática, o deploy ficou dias atrás da `main` mesmo
com o CI verde e o smoke de produção passando no mesmo dia.

O CI também era o gargalo: 6m15s por execução com um job serial, e depois dos jobs em paralelo (#69)
o `e2e` passou a ser o job mais lento, com 2,3–3,6 min para 79 testes em um runner de 2 núcleos.

## Decisão

O `deploy.yml` roda sozinho quando o CI termina verde num push para a `main` (`workflow_run`), fazendo
checkout do `head_sha` do run que passou, e continua aceitando `workflow_dispatch` com escolha de
migrations/API/web. O job exige `workflow_run.event == 'push'` e `head_branch == 'main'`: run de
`pull_request` não publica branch de PR, seja qual for a leitura do filtro `branches` do gatilho.
Commit cujo **assunto** traz `[skip deploy]` não dispara o deploy automático; o corpo da mensagem não
conta, porque o squash junta os corpos dos commits e o primeiro merge deste workflow foi pulado pelo
próprio texto que documentava o marcador. O `e2e` do CI roda em 2 shards
(`--shard=N/2`, 2 workers cada).

## Alternativas descartadas

- **`push: branches: [main]` direto no deploy:** publicaria em paralelo ao CI, então um teste vermelho
  ainda iria para o ar; e o `if: inputs.*` do workflow ficaria falso nesse evento, pulando migrations
  e deploy sem avisar.
- **Deploy dentro do `ci.yml`:** um job `needs: [checks, e2e]` só roda num push na `main`, mas amarraria
  o deploy ao mesmo workflow que roda em PR: qualquer mudança de permissão ou timeout do CI passaria a
  afetar a produção, e o histórico de deploy ficaria escondido no run do CI.
- **Deploy só no merge (sem esperar o CI):** merge só acontece com PR verde, mas o commit do merge
  (`--squash`) é outro build; rodar o CI nesse commit é o que garante que o que está no ar passou.
- **Checar o `[skip deploy]` no `if:` do job:** foi a primeira versão. O merge com squash concatena os
  corpos dos commits, então o PR que documentava o marcador no corpo da mensagem pulou o próprio deploy
  (run 43564093089 saiu `skipped` sem nem rodar). O assunto é a única parte que o autor controla.
- **e2e em 3+ shards:** cortaria mais tempo, mas cada shard custa uma instalação + build + servidores
  (~1,2 min) e a cota do repo privado é de 2.000 min/mês; 2 shards já tiram o job do caminho crítico.
- **Playwright com `blob` report + merge:** melhor para um relatório único, mas exige mais um job só
  para juntar os relatórios; com 2 shards, dois artefatos (`playwright-report-1`/`-2`) resolvem.

## Consequências

- Merge na `main` = produção atualizada sem passo manual; o job `Deploy (produção)` aparece no mesmo
  commit do CI que ele publicou (`Resumo` traz origem e sha).
- Merges seguidos entram em fila (`concurrency: deploy-production`, `cancel-in-progress: false`): dois
  deploys nunca se sobrepõem.
- CI sem `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` continua verde: o deploy avisa com
  `::warning::` e pula, sem falhar o run.
- O novo gatilho só existe a partir do merge que trouxe este workflow; antes disso, `workflow_dispatch`.
- Custo de minutos do Actions sobe ~2 min por execução: com cache frio o run inteiro ficou em 2m20s
  (checks 57s, e2e 2m17s + 2m01s) contra 3m08s do run de um job só, mas são 7 min cobrados contra 5.
  O `checks` resolve em ~35s quando nada mudou.
- `palette-escape.spec.ts` e `transaction-sheet-focus.spec.ts` passaram a chamar `ensureDemoData`: eram
  os dois únicos specs que esperavam a tabela de transações sem garantir o dataset demo, e dependiam de
  outro arquivo já ter sincronizado. Com shards, o arquivo pode ser o primeiro a rodar e a tabela fica
  vazia.
- Documentação: `docs/deploy.md` (passo 13, limites do Free), `README.md` e
  `docs/environment-variables.md`.
