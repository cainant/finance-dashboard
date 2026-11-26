# Revisão de segurança e qualidade — API

**Data:** 2026-11-10  
**Escopo:** `apps/api/src`, `packages/financial-providers/src`, `packages/database/src`, `packages/contracts/src` e a Pages Function (`apps/web/functions/api/[[path]].ts`).  
**Método:** leitura integral do código, auditorias paralelas de autorização e de limites do Workers Free, testes de integração no runtime real do workerd/D1, medições de queries e wall time.  
**Restrição aplicada:** somente free tiers (Workers Free 10 ms CPU, 50 subrequests **e** 50 queries D1 por invocação, KV 1.000 escritas/dia). Nenhum recurso Cloudflare foi criado ou alterado.

## Resumo

Foram corrigidos 30 problemas reais, incluindo 8 de severidade alta: corrida no setup do primeiro usuário, IDOR de item Pluggy entre usuários, estouro do orçamento de queries D1/subrequests no sync (2 achados), cron com 3 conexões, sync demo concentrado em um único request, série histórica de cartão com sinal invertido e reconstrução de histórico a partir de páginas parciais. Os demais achados foram aceitos com justificativa ou são notas para a thread do frontend.

## Achados corrigidos

| ID | Sev. | Achado | Correção |
| --- | --- | --- | --- |
| AUTH-01 | Alta | `setupFirstUser` fazia check-then-insert; dois `POST /api/auth/setup` concorrentes criavam dois usuários. | `INSERT ... SELECT ... WHERE NOT EXISTS` atômico + teste concorrente (201 + 409). PR #15. |
| AUTH-02 | Média | `findSession` fazia `DELETE` no D1 para **todo** token inválido, permitindo amplificação de escrita. | Só apaga quando a linha existe e está expirada; token inexistente é somente leitura. PR #15. |
| AUTH-03 | Média | Fallback de e-mail do GitHub aceitava endereço não verificado (`emails[0]`). | Só e-mails `verified`; caso contrário usa `@users.noreply.github.com`. PR #15. |
| AUTH-04 | Baixa | Dois callbacks OAuth concorrentes do mesmo login podiam responder 500 no unique de `github_login`. | Captura a violação e devolve o usuário vencedor. PR #15. |
| AUTH-05 | Baixa | Erro de permissão do OAuth era detectado por substring da mensagem. | Checagem por `AppError.code === "forbidden"`. PR #15. |
| AUTH-06 | Média | `login_attempts` de chaves antigas crescia sem limite. | Manutenção no cron em um único `db.batch` (sessões expiradas, tentativas >24 h, sync-runs >90 dias). PR #15. |
| AUTH-07 | Baixa | Cookie de sessão aceitava token de qualquer tamanho. | Limite 20–128 chars antes do SHA-256. PR #15. |
| AUTHZ-01 | Alta | `POST /api/connections` aceitava `itemId` Pluggy já vinculado a outro usuário; quem soubesse o id anexava e sincronizava os dados da vítima. | Checagem global de `(provider, external_id)` antes do provider + teste de IDOR. PR #17. |
| AUTHZ-02 | Baixa | `PATCH /transactions`, `DELETE /connections`, `sync-runs` e `bills` do cartão validavam o dono e depois consultavam/gravavam só pelo id. | Filtro de `user_id` repetido na própria escrita/consulta (defesa em profundidade). PR #17. |
| VAL-01 | Média | Busca usava `LIKE`; o D1 limita o padrão a 50 bytes, então `q` de 120 chars virava erro 500. Escape manual de `%`/`_`/`\` era frágil. | `instr(lower(col), lower(?))` com parâmetro vinculado; teste com `%`, `_` e `q` máximo. PR #17. |
| VAL-02 | Média | Nenhum limite de corpo JSON em `/api/*`. | `bodyLimit` de 32 KiB (413); teste com 40 KB. PR #17. |
| VAL-03 | Baixa | JSON malformado podia escapar do envelope padrão. | Verificado: `HTTPException(400)` vira `bad_request` sem stack; teste adicionado. PR #17. |
| VAL-04 | Média | CSRF aceitava `X-Forwarded-Host` como origem também em produção (header controlável). | Fallback restrito a desenvolvimento; teste em produção. PR #17. |
| WEB-01 | Média | Webhook confiava em `event: item/deleted` do payload para desconectar. | Só desconecta após o provider confirmar 404; se o item existe, ignora. Testes 404 vs existente. PR #17. |
| WEB-02 | Baixa | Resposta do webhook sem `Cache-Control`. | `no-store` em todas as respostas do webhook. PR #17. |
| FREE-01 | Alta | Sync fazia dezenas de escritas D1 sequenciais (transações em chunks de 5, snapshots, saldos, finish). O D1 Free permite 50 queries por invocação. | `db.batch()` em todas as escritas (1 query por batch); contas com `RETURNING` (sem select extra); cartões+faturas e saldos+snapshots no mesmo batch. Medido: **42 queries** no pior slice. PR #19. |
| FREE-02 | Alta | Orçamento de 30 subrequests contava só páginas de transações; `getAccounts/getCreditCards/getBalances` podiam somar 30+ chamadas e estourar 50. | `RequestBudget` compartilhado (45), reserva por etapa, `maxPages` explícito, cache de `/accounts`; conexão que não cabe fica para o próximo cron. Teste com provider fake. PR #19. |
| FREE-03 | Alta | Cron sincronizava 3 conexões, cada uma com seu próprio orçamento de D1/subrequests. | Até 2 conexões com orçamento único de 45; manutenção no mesmo cron. PR #19. |
| FREE-04 | Alta | Primeiro sync demo montava ~760 transações, ~900 snapshots e ~87 batches em um request (2,4 s de wall time mediados no `wrangler dev`). O build do dataset custava ~20 ms de JS no request. | Dataset aquecido no startup (`prewarmDemoDataset`, cache por data UTC) + paginação demo de 60 transações/conta com cursor em `stats_json._pending`. Medido: 7 slices, máx. **99 ms** no workerd / **224 ms** no `wrangler dev` e **42 queries** por slice; travessia aquecida <10 ms. PR #19. |
| FREE-05 | Média | Pluggy buscava `/accounts` 3× por sync (`getAccounts`, `getCreditCards`, `getBalances`), até 30 subrequests. | Cache curto por item na instância do provider + um único fetch; testes de cache e `maxPages`. PR #19. |
| FREE-06 | Média | Overview fazia 8 queries (recalculava `balanceTotals` e `investmentsTotal`). | 5 queries: totais, saldos (2), investimentos; patrimônio derivado em JS. PR #19. |
| FREE-07 | Média | `GET /bills/upcoming` lia todas as faturas e fatiava em JS. | `LIMIT` no SQL; `isUnpaidStatus` redundante removido. PR #17. |
| FREE-08 | Baixa | Chunks de upsert chegavam a 96 params (limite 100), sem proteção contra adicionar coluna. | Tamanhos documentados por tabela e batches agrupados; pior caso atual 90 params (transações). PR #19. |
| FUNC-01 | Alta | Snapshot histórico de cartão usava o mesmo sinal de conta corrente. Como compra é negativa e dívida positiva, a série histórica ficava invertida. | `direction = -1` para `credit_card` no cálculo abertura/cumulativo; teste compara cada snapshot com a soma real das transações. PR #19. |
| FUNC-02 | Alta | Ao retomar um cursor, o histórico era reconstruído com apenas as páginas daquela execução (somatório incompleto). | Histórico calculado por agregações no D1 (`SUM` por dia + total por conta), não pelo array baixado; teste com provider paginado. PR #19. |
| FUNC-03 | Média | Todo sync reescrevia ~130 snapshots por conta. | Datas estáveis já gravadas são puladas; só os últimos 7 dias e datas ausentes são reescritos. PR #19. |
| FUNC-04 | Baixa | Deltas do overview sem cobertura de período de 31 dias/resultado negativo. | Fórmula verificada (`delta = current - previous`, `%` sobre `abs(previous)`) e testes existentes de período anterior/zero. Sem mudança. |
| FUNC-05 | Baixa | Patrimônio poderia somar dívida de cartão como ativo ou ignorar faturas. | Verificado: cartão entra só em passivo; dívida do cartão = soma das faturas não pagas (teste demo) e snapshot de hoje = saldo devedor. Investimentos entram como ativo. |
| FUNC-06 | Baixa | Sync poderia sobrescrever categoria manual. | Verificado por teste: `category_source = 'user'` vence o upsert. Sem mudança. |
| FUNC-07 | Baixa | Sync poderia duplicar dados em execuções repetidas. | Verificado por teste de idempotência (upsert por `account/external_id`, snapshots por PK). Sem mudança. |

## Achados aceitos / documentados

| ID | Sev. | Achado | Justificativa |
| --- | --- | --- | --- |
| ACC-01 | Baixa | `todayIsoDate()` usa UTC; o Brasil é UTC−3. | Datas de provider já são convertidas para `America/Sao_Paulo`; a janela padrão do dashboard é UTC e está documentada. Mudar a semântica afetaria filtros/contratos; fica como melhoria futura. |
| ACC-02 | Baixa | Série de patrimônio usa o total **atual** de investimentos para todos os pontos históricos. | Não há histórico de posições no provider; a aproximação está documentada na análise. Séries de contas usam snapshots reais. |
| ACC-03 | Baixa | `redirect_uri`/redirect pós-login derivam do Host da request; não há `APP_ORIGIN` fixo. | O GitHub só aceita o callback cadastrado e o `state` é HttpOnly/timing-safe; o Worker de produção fica atrás da Pages Function com a mesma origem. Fixar `APP_ORIGIN` exigiria nova var e não fecha um vetor explorável hoje. |
| ACC-04 | Baixa | Rate limit de senha em D1 permite lockout de um e-mail (10 falhas/15 min). | Login por senha é desabilitado em produção; o caminho de produção é GitHub OAuth com allowlist. |
| ACC-05 | Baixa | Webhook não tem nonce/assinatura (a Pluggy não assina). | Header secreto comparado em tempo constante, `clientId` conferido, recurso sempre re-buscado no provider e sync idempotente. Replay só repete um sync. |
| ACC-06 | Baixa | `sync_runs` não tem índice em `(connection_id, started_at)`. | Retenção de 90 dias + volume de app pessoal mantém a tabela pequena. Migração futura se necessário. |
| ACC-07 | Baixa | `periodQuery` não limita o intervalo máximo; SQL agrega todo o histórico. | Consultas usam `transactions_user_id_date_idx`; o frontend oferece períodos razoáveis. Limitar mudaria o contrato de "todo o período". |
| ACC-08 | Baixa | `/api/health` devolve `env` (`development`/`production`). | Informação de baixa sensibilidade e contrato existente do health check. |
| ACC-09 | Baixa | `institutionId`/`institutionName` são aceitos no body de conexão mas ignorados. | Sem impacto de segurança; o provider é a fonte da verdade. Limpeza de contrato pode entrar em outra iteração. |
| ACC-10 | Baixa | Não há rate limit específico no início do OAuth. | O GitHub aplica seus próprios limites e a allowlist é fail-closed. |

## Verificações que não viraram achado

- **SQL injection:** todos os valores de filtro/cursor são parâmetros vinculados; `orderBy` é um `switch` fechado; `q` não interpola texto no SQL.
- **Erros:** respostas 500 são `{ code: "internal_error", message: "Erro interno" }` sem stack; detalhes de `ProviderError` expõem só `providerCode`/`retryable`.
- **Logs:** `requestLogger` loga só path (sem query), status, duração e `userId`; erros de OAuth/webhook logam nome do erro, nunca token/payload financeiro.
- **Sessão:** token de 32 bytes no cookie, só SHA-256 no D1, expiração de 30 dias, renovação deslizante, logout apaga a linha, `Secure` em produção.
- **PBKDF2:** exatamente 100.000 iterações; `parsePasswordHash` rejeita >100.000; comparação em tempo constante testada.
- **KV:** única escrita é a `apiKey` do Pluggy com `expirationTtl` (≈12/dia), sem escrita por request.
- **Categorias:** sistema (`user_id IS NULL`) + do usuário; categoria de outro usuário não pode ser atribuída (teste).
- **Autorização:** todas as rotas de contas/transações/faturas/cartões/conexões/investimentos/settings/analytics/sync-runs filtram por `user_id`; rotas protegidas exigem sessão; webhook é o único `/api` público fora de auth/health e tem segredo próprio.

## Notas para a thread do frontend (não editado aqui)

1. **CSP/headers dos assets estáticos:** a Pages Function só encaminha `/api/*`; `index.html` e os assets não recebem CSP, `X-Content-Type-Options`, `Referrer-Policy` nem HSTS. Recomendo um `_headers` no build do Pages (ou headers na Function para navegação) com CSP compatível com o bundle Vite e `frame-ancestors 'none'`.
2. **Cookie:** considerar o prefixo `__Host-fd_session` (exige `Secure`, `Path=/`, sem `Domain`). A API já atende aos requisitos em produção; a troca precisa ser coordenada com o frontend/login.
3. **Sincronização demo:** a UI deve continuar chamando `POST /api/connections/:id/sync` até `statusDetail !== "PARTIAL_SYNC"` (ou até o número de transações parar de crescer) para completar o histórico fatiado. A UI deve exibir o selo "Demonstração".
4. **Erros:** o envelope `{ error: { code, message, details? } }` agora cobre JSON malformado (400) e corpo grande (413); a UI pode mostrar a mensagem sem parsing especial.

## Testes e medições

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: verdes localmente e no CI.
- API: 83 testes (workerd + D1 real), incluindo setup concorrente, OIDC/allowlist, IDOR, busca com `%`/`_`, webhook 404 vs existente, orçamento de subrequests e de queries D1.
- Providers: 104 testes, incluindo paginação demo, cache de `/accounts` e limite `maxPages`.
- Medições locais: dataset demo aquecido percorrido em <10 ms; build frio ~20 ms movido para startup; sync demo completo em 7 slices, máx. 42 queries D1 no workerd e **224 ms** de wall time por slice no `wrangler dev` (1,27 s no total; antes: 2,4 s em um único POST).
- PRs: #15 (auth), #17 (autorização/validação/webhook) e #19 (sync/limites/CPU).
