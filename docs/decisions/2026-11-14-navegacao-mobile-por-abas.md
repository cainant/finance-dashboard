# Navegação mobile por abas e vidro restrito ao chrome

- **Data:** 2026-11-14
- **PR:** #73

## Contexto

Abaixo de `lg` o shell tinha um botão hambúrguer que abria a sidebar num `Sheet` lateral: dois
toques para trocar de tela, destinos escondidos e cara de site, não de app. O protótipo mobile D
aprovado propõe barra de abas inferior,
barra superior translúcida e uma tela "Mais".

## Decisão

Abaixo de `lg`, a navegação é uma barra de abas inferior com 5 destinos (Visão geral, Transações,
Contas, Cartões, Mais); Análises, Conexões, Configurações, busca, sincronização, tema e ocultar
valores vivem na rota `/more`. O desktop (`lg`+) continua com a sidebar e não ganha item novo.

`backdrop-filter` existe somente nos dois elementos fixos de chrome (barra superior e barra de
abas), via `.glass-bar` e `.glass-tabbar`; nunca em cards, listas ou o que rola. Animações usam só
`transform` e `opacity`. Com `prefers-reduced-transparency: reduce` ou sem suporte, o fundo é
sólido (`--glass-*-solid`). O título compacto da barra superior depende do h1 sair da tela
(scroll passivo + rAF, estado booleano).

## Alternativas descartadas

- **Manter o hambúrguer e só trocar o visual:** continua exigindo dois toques e escondendo destinos.
- **Vidro também em cards, listas e sheets:** custo de GPU em listas roláveis longas e pior
  legibilidade; o design system tem cards planos.
- **Sidebar fixa em tablets:** o breakpoint `lg` já separa o que cabe com sidebar.

## Consequências

- Nova rota `/more`; `NAV_ITEMS`/sidebar inalterados (`MOBILE_TABS` e `activeMobileTab` em `lib/nav.ts`).
- O botão de tema sai da topbar no mobile e vai para "Mais" (o menu da conta continua com ele).
- O "Voltar para contas" interno da página de conta foi removido: a topbar mostra "‹ Contas".
- Etapas seguintes (listas, sheet de transação, visão geral, gestos) reaproveitam os tokens de vidro.
