# Detalhes no mobile: voltar nativo, view transitions e puxar para atualizar

- **Data:** 2026-11-16
- **PR:** #81

## Contexto

Etapa 6 do trabalho "cara de app" no mobile. O protótipo mobile D
aprovado mostra telas de detalhe de conta e de cartão, um gesto de voltar pela borda
esquerda, transições de empurrar e o puxar para atualizar. O protótipo simula o gesto de voltar porque
roda dentro de uma moldura; o produto roda no navegador (e como PWA instalado), onde iOS e Android já
têm o gesto de voltar do sistema.

## Decisão

**Voltar é o histórico.** Não há gesto próprio de borda: ele competiria com o do sistema. Cada
detalhe (`/accounts/$id`, `/credit-cards/$id`) é uma entrada de histórico (push), o botão voltar da
barra superior e o gesto do sistema levam à mesma entrada, e a rolagem da tela anterior é restaurada
pelo router (`scrollRestoration`). O botão só usa `history.back()` quando a trilha de telas
(`lib/nav-trail.ts`, em memória, indexada por `location.state.__TSR_index`) sabe qual é a entrada
anterior; o rótulo é o nome dela ("‹ Visão geral", "‹ Contas"). Sem trilha (deep link, reload) cai na
lista de origem por link normal.

**Transições com a View Transitions API, como melhoria progressiva.** `defaultViewTransition` do router
(`types` por navegação): entrar num detalhe = `nav-forward` (página nova entra pela direita, a antiga
recua 22% e escurece), sair = `nav-back` (inverso), 300 ms, só `transform`/`opacity`. Abas trocam sem
animação (`viewTransition={false}` nos links da barra de abas). Nada roda no desktop (`lg`+), com
`prefers-reduced-motion`, em aba oculta nem sem suporte a `:active-view-transition-type` (nesse caso o
router recebe `undefined`: sem tipos ele faria um fade em toda navegação, inclusive entre abas). O
chrome fixo (barra superior e de abas) ganha `view-transition-name` só durante a transição e usa o
fundo sólido, porque o `backdrop-filter` não sobrevive ao snapshot.

**iOS não anima em dobro.** O Safari anima sozinho o gesto de voltar pela borda e só então dispara o
`popstate`. Um `popstate` não pedido pelo app, no iOS (UA iOS ou iPadOS com multitoque), pula a
transição; o botão voltar do app (`markProgrammaticBack`) continua animando. Não há aparelho iOS neste
ambiente: a heurística (e o quanto o WebKit já anima) precisa ser conferida pelo dono num iPhone.

**Puxar para atualizar = recarregar os dados da nossa API.** `DataRefreshProvider` faz
`queryClient.refetchQueries({ type: "active" }, { throwOnError: true })`: refaz as consultas da tela e
do chrome. Não chama `POST /api/connections/:id/sync`: o provider não faz refresh sob demanda e a
sincronização tem custo e regras próprias, então continua explícita em "Sincronizar agora". O status de
frescor (`deriveSyncStatus`) continua sendo a fonte da verdade do quão novos os dados do provider são.
Falha vira `toast.error` e o indicador some.

Gesto (`lib/pull-to-refresh.ts`, puro e testado): ativa só abaixo de `lg`, com `scrollY === 0`, um dedo,
fora de campo de texto, diálogo/sheet/menu, `data-no-pull-refresh` e de qualquer ancestral que já esteja
rolado. Folga de 10px; movimento horizontal (ou para cima) abandona; distância visual
`110·(1 − e^(−x/130))`, limiar de 64px (≈115px de dedo), repouso em 56px enquanto carrega. O indicador é
fixo, escrito por ref em `--ptr-y`/`--ptr-p` (sem `setState` por evento) e usa só `transform`/`opacity`.
Os listeners (`touchstart/move/end`) são **passivos**: não é preciso `preventDefault`, porque
`overscroll-behavior-y: none` (só abaixo de `lg`, só no `html`, o rolador do viewport) desliga o
recarregar nativo (Chrome Android) e o elástico do iOS no topo, para o indicador ser o único efeito do
puxão, sem tirar a rolagem. Sheets, listas e contêineres com rolagem própria seguem com `overscroll-contain`
nos próprios elementos. **Só dá para confirmar em aparelho:** o iOS Safari/PWA não é reproduzível no
Chromium do e2e, então o efeito (sem estique da página enquanto o indicador aparece) fica para teste
manual em iPhone. Alternativas sem gesto: botão "Atualizar dados" que só aparece com foco (teclado e
leitor de tela) e item "Atualizar dados" no menu da conta; o estado vai para uma região `role="status"`.

**Listas infinitas (Transações): só a primeira página** (`lib/refresh-queries.ts`). Um `refetchQueries` numa
query infinita refaz *todas* as páginas já carregadas em sequência (dezenas de requisições ao Worker do
plano gratuito), então o gesto busca só a primeira página num cliente descartável: se ela não mudou, o
cache fica como está; se mudou, o cache vira essa página e o carregamento em segundo plano da lista
rebusca as demais. Limitações aceitas:

- (a) Se a primeira página não mudou, uma alteração que só existe numa página posterior (por exemplo, a
  categoria de uma transação antiga editada em outro aparelho) **não é trazida pelo gesto**. Ela chega na
  próxima carga da lista (recarregar, voltar à tela depois de o dado ficar velho) ou por uma edição local
  (que invalida a query inteira).
- (b) Quando a primeira página muda, o cache volta a ter uma página e o carregamento em segundo plano
  rebusca as demais (N requisições). Isso só acontece quando há dado novo; sem dado novo o gesto custa
  uma requisição da lista.

Convivência com a lista mobile de Transações (#80), verificada no e2e: o gesto só começa no topo da página
(a lista rola na janela), não age com campo de **texto** focado e teclado aberto (`isTextEntryActive`: tipos text/search/email/number/tel/url/password, textarea e contenteditable; checkbox, radio, range e botões não bloqueiam, e com o teclado fechado pelo voltar do Android o foco no campo não bloqueia: `visualViewport.height` < 85% da janela), sheet/detalhe abertos (`body[data-scroll-locked]`)
nem com gesto horizontal (deslizar lançamento, trilho de chips: `classifyPull` abandona); o indicador tem
`z-index` 25, acima da barra fixa de busca (20) e abaixo da barra superior (30). A edição de categoria não é
otimista: grava e invalida `["transactions"]`, o que troca a referência do cache; o resultado da primeira
página buscado antes disso é descartado por `refreshFirstPage` (`query.state.data !== cached`) e, se ainda
chegar antes da invalidação, é sobrescrito por ela.

**Cartões: rota nova de detalhe, sem contrato novo.** A página `/credit-cards` guardava o cartão e a
fatura selecionados em `useState`, não em search params, então não dava para ter "uma tela = uma
entrada de histórico". Abaixo de `lg` a lista vira linhas tocáveis (`CreditCardRow`) e abre
`/credit-cards/$accountId`, que reaproveita `GET /api/credit-cards`, `/api/credit-cards/:id/bills` e
`/api/bills/:id/transactions`; a fatura escolhida vive em `?bill=` e muda com `replace`. No desktop a
página continua idêntica (tiles selecionáveis).

## Alternativas descartadas

- **Gesto próprio de voltar pela borda:** duplica o do sistema, briga com ele no iOS e quebra o
  histórico (o gesto simulado não é uma navegação de verdade).
- **Biblioteca de animação/gesto:** peso e controle menor que ~150 linhas de CSS + um hook com ref.
- **Puxar disparando o sync do provider:** gasta cota do provider e do Worker por um gesto casual, e
  o MeuPluggy não atualiza sob demanda.
- **`touchmove` não passivo com `preventDefault`:** desnecessário com `overscroll-behavior-y: none`,
  e custaria rolagem fluida.
- **Manter o seletor de cartão por `useState` no mobile:** sem histórico, o voltar do sistema sairia da
  tela de Cartões em vez de fechar o detalhe.

## Consequências

- Novos arquivos: `lib/pull-to-refresh.ts`, `lib/nav-trail.ts`, `lib/view-transitions.ts`,
  `components/layout/data-refresh*.ts(x)`, `components/accounts/account-detail-{mobile,parts}.tsx`,
  `components/credit-cards/credit-card-row.tsx`, rota `_app.credit-cards_.$accountId.tsx`.
- "Atualizar" refaz as consultas ativas, mas uma query infinita com várias páginas carregadas (lista de
  Transações) custa **uma** requisição: `refetchQueries` refaria cada página em sequência (o TanStack
  v5 não tem como limitar páginas no refetch), então `lib/refresh-queries.ts` busca só a primeira página
  num cliente descartável (`fetchInfiniteQuery({ pages: 1 })`). Inalterada: o cache, a lista e a rolagem
  não se mexem. Mudou: o cache vira essa página (cursores consistentes) e o resto volta pelo carregamento
  normal da lista, não pelo gesto.
- **Telas da aba "Mais"**: Conexões, Análises e Configurações não são telas empilhadas (sem botão voltar,
  sem transição de push; volta-se pela aba ou pelo gesto do sistema), ao contrário dos detalhes de conta e
  de cartão.
- **Links antigos de fatura**: abaixo de `lg`, `/credit-cards?card=&bill=` redireciona (`replace`, em
  `beforeLoad`, sem piscar a lista) para `/credit-cards/$accountId?bill=`; `card` inexistente cai na
  lista. Os links mobile da Visão geral (lista de faturas e faixa de atenção) já apontam direto ao detalhe.
- A marca do voltar programático (`markProgrammaticBack`) expira em 1,5 s e é consumida por navegação:
  um `history.back()` sem efeito não contamina o próximo gesto.
- A trilha de telas vive só na memória da aba; depois de um reload o botão voltar usa o destino fixo.
- A transição entre telas não foi vista em aparelho: validado por e2e (tipos escolhidos, nenhuma em abas,
  desktop e movimento reduzido) e por captura no Chromium; o dono confere fluidez e o iOS num aparelho.
