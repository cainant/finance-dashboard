# ADR 0002 — Restrição de custo zero: tudo nos free tiers

- Status: aceito
- Data: 2026-11-10
- Contexto relacionado: [architecture.md](../architecture.md) (§Restrição de custo, §Bindings), [auth-on-workers.md](../research/auth-on-workers.md)

## Contexto

O projeto é um dashboard pessoal, sem receita e sem orçamento de infraestrutura. Qualquer produto pago
— ou que exija cartão — está fora de escopo, no runtime e em CI, banco e integrações. Os limites dos
planos gratuitos deixam de ser detalhe operacional e passam a moldar a arquitetura.

## Decisão

Operar exclusivamente dentro de:

- **Workers Free**: 10 ms de CPU por request, 100.000 requests/dia, 50 subrequests por request.
- **Pages Free**: hospedagem do `apps/web/dist` e Pages Functions.
- **D1 Free**: 5 milhões de linhas lidas/dia, 100.000 escritas/dia, 5 GB de armazenamento.
- **KV Free**: 100.000 leituras/dia e 1.000 escritas/dia.
- **GitHub Free**: Actions com 2.000 minutos/mês em repositório privado.
- **Pluggy**: sandbox gratuito e MeuPluggy para uso pessoal (ver [ADR 0003](0003-pluggy-como-provider-open-finance.md)).

Regras derivadas:

- Sem Workers Paid, Queues, R2 ou Durable Objects pagos. Trabalho assíncrono usa `ctx.waitUntil`.
- KV só como cache de leitura com TTL (ex.: `apiKey` da Pluggy), nunca escrita por request; rate limit e
  contadores ficam em D1.
- Agregações (KPIs, cashflow, categorias, evolução patrimonial) em SQL no D1; nada de somar milhares de
  linhas em JavaScript no Worker.
- CI enxuto: cache do pnpm, um job, Playwright apenas com chromium.

## Consequências

- Positivas: custo recorrente zero e nenhum recurso dependente de cartão; a aplicação segue portável se
  o free tier mudar. Agregação em SQL tende a ser mais rápida e reduz o consumo de CPU.
- Negativas / custos: a sincronização precisa ser incremental (`last_synced_at` − 7 dias) e paginada por
  execução, continuando no próximo cron; uma carga inicial grande se divide em várias execuções. Sem
  fila, picos de webhook concorrem com o cron no mesmo orçamento de CPU e subrequests.
- Negativas / custos: login por senha fica restrito a dev/teste, porque o PBKDF2 não cabe nos 10 ms
  ([ADR 0001](0001-auth-github-oauth-sessao-d1.md)); qualquer trabalho de CPU novo precisa ser medido
  antes de entrar.
- Alternativas descartadas: Workers Paid (US$ 5/mês) para liberar CPU e cron mais longo; Queues para
  desacoplar sync e webhook; R2 para payloads brutos; banco gerenciado fora do D1. Todas violam a
  restrição de custo zero.
