# Exportação e carregamento dos lançamentos em segundo plano

- **Data:** 2026-11-14
- **PR:** #75

## Contexto

O botão "Exportar" da página de transações gerava o CSV só com as páginas já
carregadas: a lista usa `useInfiniteQuery` de 50 em 50 com um botão "Carregar
mais". Em produção há 3.116 lançamentos nos últimos 365 dias (12/11/2025 a
13/11/2026, três conexões Pluggy), então exportar o ano exigia 63 cliques e
qualquer falha de rolagem entregava um CSV incompleto sem aviso — justamente
o arquivo que o usuário manda para uma IA analisar.

## Decisão

O botão "Exportar" baixa **todas** as páginas do filtro atual, independente do
que está na tela, com `limit=200` (o máximo aceito pela API) e cursor keyset;
só então monta o CSV (`collectAllTransactions`, em
`apps/web/src/lib/export.ts`). O layout do arquivo continua o mesmo, compatível
com Excel pt-BR (separador `;`, BOM, data `YYYY-MM-DD`).

A lista de transações carrega as páginas seguintes sozinha, em lotes de 200,
uma por vez, com 300 ms entre requests, enquanto a aba estiver visível — sem
botão "Carregar mais" e sem depender de o usuário chegar ao fim da rolagem. A
primeira página continua com 50 para a pintura inicial ser rápida. O
carregamento pausa com a aba oculta, durante um refetch e durante a exportação.
Se um lote falhar depois dos retries do TanStack Query, ele para e o rodapé
oferece "Tentar novamente" (um retry automático em loop martelaria a API).

## Alternativas descartadas

- **Exportar no Worker (`GET /api/transactions/export`):** gastaria CPU do
  Workers Free (10 ms por request) e duplicaria filtros e DTOs da lista; o
  navegador já consegue percorrer o mesmo cursor.
- **Usar `limit=200` desde a primeira página:** a pintura inicial ficaria
  refém do maior payload; o lote inicial de 50 entrega a tabela antes.
- **Manter o botão "Carregar mais" e só aumentar o lote:** o botão continuaria
  obrigatório para chegar ao fim do ano e para exportar tudo.

## Consequências

- `?tx=` de um lançamento de página posterior passa a abrir quando o lote que
  o contém chega. A URL só é limpa como id morto com a lista completa
  (`!hasNextPage`), nunca nas pausas entre lotes — senão um link válido seria
  descartado no meio do carregamento.
- Cada visita à página de transações lê o filtro inteiro do D1 (~16 requests
  de 200 para 365 dias). No Free (~5M linhas lidas/dia) isso é folgado para o
  volume atual; se o histórico crescer, o primeiro ajuste é o intervalo entre
  lotes, não voltar ao botão.
- O CSV passa a ter o tamanho do período (3.116 linhas ≈ 400 KB), não o das
  páginas carregadas. Cursor repetido pela API faz a exportação falhar com
  toast em vez de gerar arquivo truncado; coberto em `export.test.ts`.
- O rodapé compartilhado entre tabela e cartões
  (`apps/web/src/components/transactions/transactions-footer.tsx`) mostra a
  contagem do filtro, "Carregando…" durante os lotes, "Fim da lista" no fim e
  "Tentar novamente" em falha.
