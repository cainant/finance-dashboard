# Transações no mobile: lista por dia, busca fixa, sheet de filtros e deslizar

- **Data:** 2026-11-16
- **PR:** #80

## Contexto

Etapa 5 de 6 da experiência mobile (protótipo D, aba "Transações"). Abaixo de `md` a tela era uma
lista de cartões dentro de um contêiner com rolagem própria (`max-h-[62vh]`), com a barra de filtros
do desktop empilhada no topo e o card de resumo/categorias no fim da página. Rolar a lista não rolava
a página, não havia busca fixa e a categoria só mudava abrindo o detalhe ou um popover pequeno.

## Decisão

**Breakpoint.** A tela nova vale abaixo de `md` (768px), onde a tabela já cedia lugar aos cartões. De
768 a 1023px continua a tabela com a barra de filtros do desktop (o bottom sheet de detalhe já é
usado ali desde o #74). O desktop (`lg`+) não muda.

**Rolagem e virtualização.** A lista usa a **janela** como contêiner (`useWindowVirtualizer`, linhas
de altura fixa e sem `measureElement`, como a tabela do #78): a página rola inteira, a barra superior
e a de busca ficam fixas. As posições vêm de alturas conhecidas (36px de dia, 64px de linha), então o
esqueleto ocupa o mesmo espaço da lista real. Linhas memoizadas; o `scrollMargin` é medido com
`ResizeObserver` no `body`.

**Cabeçalho do dia "sticky".** `position: sticky` não funciona em linhas virtuais com
`position: absolute`. Em vez de montar e medir cabeçalhos por linha, um único cabeçalho fixo
(`StickyDayHeader`) cobre o cabeçalho real do dia em vigor e só troca o texto ao cruzar um dia. O
custo por evento de rolagem é uma busca binária em um array de posições (listener passivo);
`setState` só quando o dia muda. É decorativo para leitor de tela (`aria-hidden`); o cabeçalho real
na lista continua lá. Descartado: renderizar o dia ativo como item `sticky` dentro do virtualizador
(o React só re-renderiza quando o intervalo visível muda, então a troca de dia atrasava até uma
linha e o cabeçalho novo "piscava" sob a barra).

**Filtros = os search params da rota.** Chips Todas/Saídas/Entradas/Sem categoria/Pendentes são
exclusivos e mapeiam para `type`, `uncategorized` e o novo `pending` (`quickKindPatch`). Uma URL com
combinação (`type=expense&uncategorized=true`) não marca chip rápido e cada parâmetro vira um chip
removível, junto com conta e categoria. Não existe segundo estado de filtro; a busca é o `q` (campo
com debounce de 250 ms, como no desktop). O sheet de filtros oferece categoria (inclusive "Sem
categoria"), conta e ordenação, o que o desktop oferece nos selects; cada toque aplica na hora
(`navigate` com `replace`) e "Ver N lançamentos" só fecha.

**Filtro de pendentes.** A API não filtrava por status. `?pending=true` entra na lista **e** no
resumo (`transactionFilterConditions`, mesmo `WHERE`) e no search param `pending` da rota. O desktop
só mostra um chip "Pendentes" quando o parâmetro está ativo (sem controle novo).

**Contagens nos chips.** Só o chip ativo mostra a contagem (o `totalCount` do resumo do filtro
atual). Contagens de todos os chips custariam uma requisição de resumo por chip, e as contagens por
categoria do resumo não servem: "Sem categoria" na API exclui pendentes e transferências, a contagem
por categoria não.

**Resumo do resultado.** A linha de Entradas/Saídas usa o agregado `/api/transactions/summary` do
filtro inteiro (SQL), não as linhas carregadas em lotes: o número não muda enquanto os lotes chegam.
Pendentes e transferências ficam fora de entradas/saídas (regra das análises); com o chip Pendentes
a linha mostra a contagem e "não entram nos totais". O total de cada **dia** usa a mesma regra
(entradas − saídas efetivadas) e **não é exibido** no último dia enquanto há lotes por carregar,
nem em dias só com pendentes/transferências: um total parcial não pode passar por total do dia.

**Deslizar para categorizar.** Delegação de ponteiros no `<ul>` (`useSwipeToAct`): estado em ref,
movimento escrito direto em `transform`/`data-armed`, nenhum `setState` por evento. A linha tem
`touch-action: pan-y`; o gesto só é assumido quando o deslocamento é claramente horizontal (≥ 10px e
> 1,6× o vertical, `lib/swipe-gesture.ts`), senão a rolagem é da página. Não começa a menos de 24px
de cada borda da tela (voltar do sistema: iOS à esquerda, Android nas duas). Passar de 72px e soltar
abre o mesmo sheet do detalhe **direto na grade de categorias** (`initialPage="category"`), com o
mesmo aviso e "Desfazer". O `click` que o navegador gera ao soltar é suprimido. Alternativas sem
gesto: o toque abre o detalhe (linha "Categoria", já com foco) e, na linha focada, a seta ← faz o
mesmo que o gesto (`aria-keyshortcuts`).

**Gatilho dos filtros.** Botão flutuante no canto inferior direito, acima da barra de abas (alcance do
polegar), com ponto quando há filtro de conta, categoria ou ordenação ativo. Fica num portal no
`body` (o wrapper da página anima `transform` ao montar e um filho `fixed` o seguiria).

**Sem `backdrop-filter`** em linhas, cabeçalhos de dia, barra de busca nem no gatilho; movimentos só
com `transform`/`opacity` (mola de volta de 220 ms, sem animação com `prefers-reduced-motion`).

## Alternativas descartadas

- **Manter o contêiner com rolagem própria:** impede busca/cabeçalho fixos relativos à página e dá a
  rolagem "dentro da página" que o app nativo não tem.
- **Cartão por dia (como no protótipo):** exigiria um item virtual por grupo de altura variável (ou
  `measureElement` por linha, que o #78 tirou). A lista é plana, com divisórias, e o cabeçalho fixo
  dá a separação.
- **Contagem em todos os chips / "Pendentes" filtrado no cliente:** ver acima; um filtro no cliente
  só enxergaria o que os lotes já trouxeram.
- **Gatilho de filtros na barra superior (protótipo):** o canto superior direito é o pior ponto para
  o polegar.

## Consequências

- `?pending=true` é parte do contrato da API (`transactionFilterFields`) e da rota de Transações.
- O sheet de filtros aberto mora na URL (`?filters=true`), como o detalhe em `?tx`: o voltar do
  sistema o fecha. O param não entra em `hasActiveTransactionFilters`, nas `queryKeys`, nos links de
  outras telas nem em "Limpar". Abrir é um `push`; "Ver N lançamentos", Esc, scrim e arrasto fecham
  com `history.back()` quando foi a própria tela que empilhou a entrada (`pushedFiltersRef`, o mesmo
  mecanismo do `pushedTxRef`) e com `replace` (só tira o param) quando a tela abriu por link direto.
  As trocas de filtro dentro do sheet seguem com `replace` na entrada do sheet (a URL fica ao vivo e
  sobrevive a recarregar). Como o voltar leva à entrada anterior, que ainda tem os filtros de antes de
  abrir, a tela guarda `base` (filtros dessa entrada) e `current` (o que o sheet deixou) em estado
  local (`SheetEdit`), só quando foi ela que empilhou a entrada. Enquanto a URL está em `base` sem
  `filters`, a search efetiva (`{ ...url, ...current }`) é calculada no próprio render: a lista e o
  resumo nunca renderizam nem pedem o filtro antigo; um efeito grava `current` na entrada com
  `replace`. Se a URL tem outra combinação (navegação legítima), o estado é descartado em vez de
  sobrescrever. Avançar depois de fechar reabre o sheet já com os filtros escolhidos. Abrir o
  detalhe tira o `filters` da URL (nunca os dois sheets juntos): o schema já descarta `filters` quando
  há `tx`.
- Os schemas de search devolvem sempre todas as chaves, com `undefined` nas descartadas: o router faz
  `{ ...searchDoPai, ...searchValidada }` e a search do pai carrega o query string bruto, então chave
  omitida voltava com o valor bruto (`?uncategorized=true&categoryId=X`, `?pending=lixo`). A URL exibida
  só é reescrita quando alguma navegação a reconstrói; o valor lido por `useSearch` é o validado.
- Medição (Chromium headless sem GPU, 390×844, CPU 4× mais lenta, 12 meses de demo carregados,
  rolagem programática de 48px/quadro por 6s, build `vite preview`): contêiner interno antes, p50 de
  ~0,9–1,5s por quadro (5–7 quadros no total); janela depois, p50 de ~150–200ms (31–37 quadros).
  Sem limitar a CPU, depois: p50 33ms, p95 50ms, 6 tarefas longas (448ms no total). Os números
  absolutos são do ambiente sem GPU; vale a comparação relativa.
