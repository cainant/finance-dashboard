# Visão geral mobile: período único, scrub no gráfico e o que ficou fora

- **Data:** 2026-11-16
- **PR:** #79

## Contexto

Abaixo de `lg` a Visão geral reaproveitava a composição do desktop (grade de KPIs com sparklines,
gráficos em abas, coluna lateral empilhada). O protótipo mobile D aprovado
mostra outra hierarquia: patrimônio em destaque com
gráfico que responde ao dedo, resumo do período em 2×2, categorias com barra e listas tocáveis. O
protótipo também traz um seletor de mês próprio e um seletor 3M/6M/1A no gráfico, que os dados e a
URL atuais não sustentam.

## Decisão

Abaixo de `lg`, `OverviewMobile` substitui a composição do desktop (só um dos dois layouts existe
no DOM, via `useIsDesktop`, que lê o breakpoint de forma síncrona no primeiro render). Ordem:
faixa de atenção, patrimônio (com o filtro global de período e o link para Contas), resumo do
período, "Para onde foi o dinheiro", receitas vs. despesas (12 meses), contas, próximas faturas e
transações recentes.

- **Uma única fonte de período:** o filtro global da URL (`period`/`from`/`to`), exposto no cartão
  do patrimônio. Não existe seletor de mês da Visão geral. KPIs e categorias seguem esse filtro; o
  gráfico de patrimônio e o de 12 meses continuam com a janela que já tinham no desktop.
- **Links reais do router, sempre com o período:** `lib/overview-links.ts` copia só
  `period/from/to` e acrescenta o filtro prometido. Receitas e Despesas abrem Transações com
  `type=income|expense`; Resultado e Poupança abrem Análises; cada categoria abre Transações com
  `type=expense` e `categoryId` (o balde "sem categoria" vira `uncategorized=true`); cada conta abre
  `/accounts/$accountId`; cada fatura (e a faixa de atenção) abre Cartões com `?card=` e `?bill=`
  (a rota `credit-cards` passou a validar esses dois params; ids inexistentes caem no padrão).
- **Scrub sem re-render do gráfico:** o gráfico de patrimônio é SVG próprio, memoizado, com
  `touch-action: pan-y`. O ponteiro só agenda um `requestAnimationFrame`; o marcador move por
  `setAttribute` e o pai recebe o índice só quando o ponto muda. O único estado por gesto é o
  índice, que re-renderiza o texto de destaque (valor, "até <data>" e variação desde o início da
  série). Soltar ou `pointercancel` volta ao valor atual. Com valores ocultos, o `aria-label` não
  traz números.
- Nada que existia na Visão geral some: o saldo em contas virou a linha-link do cartão do
  patrimônio; as sparklines dos KPIs ficam só no desktop.

## Alternativas descartadas

- **Seletor de mês próprio na tela:** criaria um segundo conceito de período, divergindo das outras
  abas e dos links da própria tela.
- **Tooltip do Recharts para o scrub:** guarda o ponto ativo em estado do gráfico e reconstrói o SVG
  a cada movimento.
- **Seletor 3M/6M/1A independente no gráfico:** exige série de patrimônio por janela diferente da do
  período global (contrato novo de API); fica de fora.

## Consequências

- Fora do protótipo, por falta de dado/contrato: seletor 3M/6M/1A do gráfico, seletor de mês
  próprio, sparklines nos tiles de KPI e rótulos de eixo além de primeira/última data.
- Quem mudar a ordem das seções ou os destinos precisa atualizar `e2e/mobile-overview.spec.ts`.
- O e2e `kpi-cards` passou a tratar a Visão geral abaixo de `lg` pela grade própria (selo em reais
  e ausência de valor truncado).
