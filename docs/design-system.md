# Design system — Lumen Finance

Identidade visual e componentes do `apps/web` no padrão "estilo Cloudflare": denso, plano e
acromático, com um único acento azul. Fonte da verdade de produto e arquitetura:
[`architecture.md`](./architecture.md) (seções **Frontend** e **Identidade visual**).

## Onde cada coisa mora

| Caminho | Conteúdo |
| --- | --- |
| `apps/web/src/styles.css` | Tokens Tailwind v4 (`@theme inline`), paletas dark/light, base, utilitários |
| `apps/web/src/components/ui/` | Primitivos shadcn/ui (button, card, dialog, select, table, toggle-group, …) |
| `apps/web/src/components/domain/` | Componentes de domínio reutilizáveis (KpiCard, MoneyText, …) |
| `apps/web/src/components/charts/` | Gráficos Recharts e o estado vazio (`ChartEmpty`) |
| `apps/web/src/components/layout/` | Shell autenticado, sidebar, topbar, auth layout, marca |
| `apps/web/src/components/theme/` | ThemeProvider, contexto e toggle |
| `apps/web/src/lib/format.ts` | Formatação BRL, datas pt-BR e percentuais |
| `apps/web/src/lib/period.ts` | Search params e resolução do filtro de período |

Decisão: os primitivos ficam em `apps/web/src/components/ui` (shadcn é copy-in e há um único
consumidor; o Tailwind v4 varre o app sem configuração extra). `packages/ui` continua sendo a
fonte do utilitário `cn`, compartilhado por qualquer pacote. Se um segundo app passar a consumir
os mesmos componentes, eles migram para `@fd/ui` mantendo os nomes e props.

## Princípios

- **Neutro e acromático:** cinzas sem matiz e um único acento (azul). Verde, vermelho e âmbar
  só carregam significado (entrada, saída, atenção). Nunca use verde como cor de botão.
- **Plano:** cards com borda de 1px e **sem sombra**; sombra só em popover, dialog e toast.
- **Denso e alinhado:** escala fechada (veja abaixo). Nada de valores fora dela.
- **Dark é o padrão**; o claro é uma tradução de contraste equivalente (AA nos dois).
- Mantém a marca Lumen Finance, pt-BR e o rótulo "Demonstração" em todo dado do provider demo.

## Tema

- Chave de persistência: `lumen:theme` (`dark` | `light`) em `localStorage`.
- O script externo `apps/web/public/theme-init.js` aplica `class="dark"` e `color-scheme` **antes
  do primeiro paint**, evitando flash. O `ThemeProvider` mantém React/DOM em sincronia, atualiza
  `<meta name="color-scheme">`/`theme-color` e escuta `storage` para sincronizar abas.
- `useTheme()` expõe `{ theme, setTheme, toggleTheme }`; use `ThemeToggle` nas telas.
- `color-scheme` nativo deixa controles (inputs de data, scrollbars) coerentes com o tema.

## Tokens

Todos os tokens semânticos são variáveis CSS em `:root` (light) e `.dark`, mapeadas para
utilitários Tailwind em `@theme inline`. Os nomes seguem o contrato do shadcn/ui; as únicas
adições são `--border-subtle` e `--subtle-foreground`.

| Token | Escuro | Claro | Uso |
| --- | --- | --- | --- |
| `--background` | `oklch(0.1 0 0)` | `oklch(1 0 0)` | Fundo da aplicação |
| `--foreground` | `oklch(0.97 0 0)` | `oklch(0.18 0 0)` | Texto principal |
| `--card`, `--popover` | `oklch(0.17 0 0)` | `oklch(1 0 0)` | Superfícies de card e overlay |
| `--border`, `--input` | `oklch(0.32 0 0)` | `oklch(0.9 0 0)` | Bordas de 1px e contorno de campos |
| `--border-subtle` | `oklch(0.24 0 0)` | `oklch(0.945 0 0)` | Divisórias internas de card/tabela |
| `--secondary`, `--muted`, `--accent` | `oklch(0.205 0 0)` | `oklch(0.96 0 0)` | Hover, ativo, fundos neutros |
| `--muted-foreground` | `oklch(0.708 0 0)` | `oklch(0.45 0 0)` | Texto secundário |
| `--subtle-foreground` | `oklch(0.556 0 0)` | `oklch(0.55 0 0)` | Apenas ícones/chevrons apagados |
| `--primary` | `oklch(0.56 0.2 258)` | `oklch(0.52 0.2 258)` | Ação primária, foco, marca |
| `--positive` | `oklch(0.905 0.093 164)` | `oklch(0.5 0.13 160)` | Entradas / melhora |
| `--negative` / `--destructive` | `oklch(0.78 0.14 22)` / `oklch(0.65 0.2 25)` | `oklch(0.55 0.2 25)` | Saídas, piora, ação destrutiva |
| `--warning` | `oklch(0.84 0.13 82)` | `oklch(0.5 0.12 70)` | Atenção |
| `--info` | `oklch(0.72 0.13 255)` | `oklch(0.5 0.16 255)` | Informativo |
| `--surface-1/2/3` | `0.13 / 0.17 / 0.205` | `1 / 0.985 / 0.96` | Camadas internas |
| `--sidebar`, `--sidebar-accent`, `--sidebar-border` | `0.1 / 0.205 / = border` | `0.985 / 0.95 / = border` | Sidebar |
| `--chart-1` | `oklch(0.67 0.17 257)` | `oklch(0.55 0.2 258)` | Série principal |
| `--chart-2…5` | teal, âmbar, coral, violeta | idem | Séries secundárias |
| `--radius` | `0.5rem` (8px) | idem | `rounded-md` 6, `rounded-lg` 8, `rounded-xl` 12 |
| `--elevation-card` | `none` | `none` | Cards não têm sombra |
| `--elevation-popover` → `shadow-popover` | sombra difusa | sombra suave | Popover, dialog, toast |

Diretrizes:

- Valores monetários usam `tabular-nums` (`MoneyText` já aplica) e formatação BRL a partir de
  **centavos**. Nunca use float para dinheiro.
- Nunca use cores hardcoded nos componentes: use tokens (`text-positive`, `bg-warning/12`, …).
- Foco visível global de 2px com offset 2px (`--ring`). Inputs trocam o outline por borda
  primária + anel de 3px. Nunca remova o foco sem repor um anel.
- Cards usam `border` real (não `box-shadow`) e não devem ter `overflow-hidden`, para não cortar
  o anel de foco dos filhos.
- Transições de 150–200ms; `prefers-reduced-motion` desliga animações.
- Dados do provider demo **sempre** com `<DemoBadge />`.

## Escala

| Elemento | Medida |
| --- | --- |
| Texto | 12px (rótulos/metadados), 13px (sidebar, cabeçalho de tabela, botão pequeno), 14px/20px (corpo, células, abas), 16px (título de card grande), 20px/28px 600 (título de página), 24px/32px 600 (valor de KPI) |
| Controles | 28px (ícone/compacto), 32px (pequeno, busca, abas), 36px (padrão) |
| Linhas | menu 34px, tabela 44px, cabeçalho de tabela 40px, cabeçalho de card 44px, topbar/sidebar 56px |
| Raios | 6px (abas/itens pequenos), 8px (cards, botões, inputs, menus), 12px (dialog, paleta, toast), full (pills/avatares) |
| Espaçamento | múltiplos de 4; padding de card 16px; gap entre cards 16px; página 32px lateral / 28px topo (16px no mobile) |
| Larguras | sidebar 256px, trilha 56px, lateral de página 320px, Sheet 420px, conteúdo 1320px |

Não use `uppercase` com tracking largo: rótulos são 12–13px, peso 500, em `muted-foreground`.

## Componentes de domínio

### `MoneyText`

```tsx
<MoneyText valueCents={123456} />                        // R$ 1.234,56 (neutro)
<MoneyText valueCents={-8990} />                         // -R$ 89,90 (neutro)
<MoneyText valueCents={null} emptyLabel="—" />           // sem valor
<MoneyText valueCents={1250000} signDisplay="always" tone="auto" /> // +R$ 12.500,00
<MoneyText valueCents={-8990} tone="negative" />         // vermelho explícito
```

Props: `valueCents`, `tone` (`neutral|auto|positive|negative`), `size` (`sm|md|lg|xl|2xl`),
`weight`, `signDisplay`, `compact`, `currency`, `emptyLabel`.

**Política de cor de valores:** o padrão é `neutral` (`foreground`). Saldos e KPIs não são
verdes nem vermelhos — a cor fica reservada ao delta. Em listas de transações, despesas ficam
em `foreground` com sinal de menos e receitas em `positive` com `+`. `negative` só aparece em
resultado/saldo total negativo, atraso e erro. `tone="auto"` continua disponível para telas que
precisam colorir pelo sinal; props explícitas sempre vencem o padrão.

### `DeltaBadge`

`value` está em **pontos percentuais** — a convenção de `deltaPercent` da API: `2.9` → "2,9%".
`invert` para despesas (subir é ruim). O delta é texto de 13px/500 com seta, sem pílula; a cor
comunica sentimento, não o sinal matemático.
Props: `value`, `invert`, `label`, `precision`, `showIcon`, `size`.

### `KpiCard`

`label`, `valueCents`, `format` (`currency|percent|number|date`), `value` (formatos não
monetários), `percentScale`, `delta`, `deltaLabel`, `invertDelta`, `tone`, `hint`, `sparkline`
ou `series` (números), `sparklineTone`, `isLoading`, `footer`. O valor é **neutro** por padrão;
só o delta é colorido. O sparkline é uma área a 12% colada à base do card, na cor `chart-1` por
padrão. A altura mínima de 148px só vale quando o card tem uma série (o espaço do sparkline);
sem série, a altura é a do conteúdo. `icon` continua aceito (ícone inline pequeno), sem caixa
decorativa.

### `ChartCard` + `ChartTooltipContent` + `ChartEmpty`

Wrapper de Recharts com cabeçalho de 44px, ações à direita, `isLoading`, `isEmpty`/`empty` e
footer. Use `<ChartTooltipContent valueFormatter={...} labelFormatter={...} />` como conteúdo do
`Tooltip`. `ChartEmpty` é o estado padrão: pílula "Sem dados" sobre uma onda cinza discreta; os
gráficos de `components/charts` também o devolvem quando recebem série vazia.

Convenções dos gráficos: linha de 1,5px na cor da série, área a 12%, grade horizontal
`border-subtle` sem linhas verticais, **eixo Y à direita** com rótulos 12px em
`muted-foreground` e eixo X sem linha. O eixo Y usa rótulos compactos **sem "R$"** (`80 mil`,
`2,5 mil`, `0`) e largura de 64px; datas do eixo X usam `dd/MM` (`18/10`). Gráficos de área
usam domínio automático com ~10% de folga acima e abaixo da série (arredondado para fora), e só
mantêm o zero quando os dados chegam perto dele; barras continuam com base em zero. Cores de
série: `--chart-1…5`; verde/vermelho só quando a série significa entrada/saída. Nas barras de
receitas vs. despesas, receitas usam `chart-1` (azul) e despesas usam `subtle-foreground`
(cinza neutro), com legenda coerente com essas cores.

### `PageHeader`

`title` (20px/600), `badge`/pills ao lado, `description` (14px `muted-foreground`) e `actions` à
direita. `eyebrow` continua aceito por compatibilidade, mas é renderizado como linha de apoio em
12px, **sem caixa alta**. Um único `h1` por página.

### Outros

- `EmptyState` — `icon`, `title`, `description`, `action`, `compact`; card plano, ícone 32px.
- `ErrorState` — `title`, `description`, `error`, `onRetry`, `isRetrying`; borda/ícone negativo.
- `InstitutionAvatar` — `name`, `color` (hex opcional), `size` (`xs|sm|md|lg`), `decorative`
  (nome já visível ao lado: `aria-hidden`); logo real do banco pelo catálogo do Pluggy, com as
  iniciais determinísticas atrás até o `onLoad` e como fallback (`onError`), anel de 1px por cima.
- `StatusDot` — `tone` (`success|warning|danger|info|neutral`), `label`, `pulse`; ponto de 7px.
- `DemoBadge` — selo "Demonstração" (pill neutra com ícone), obrigatório em dado demo.
- `TransactionList` — lista compacta de 44px por linha; usa `CategoryIcon` e `MoneyText`.
- `FormField` — `id`, `label`, `error`, `hint`, `children`; liga `aria-describedby`/`aria-invalid`.
- `ThemeToggle` — alterna e persiste o tema.

## Primitivos disponíveis

`button`, `badge`, `card`, `input`, `label`, `select`, `dropdown-menu`, `dialog`, `sheet`,
`tabs`, `toggle-group`, `tooltip`, `skeleton`, `separator`, `avatar`, `table`, `popover`,
`scroll-area`, `switch`, `textarea`, `bottom-sheet`, `sonner` (`Toaster`). `command` e `collapsible` são usados
pelo shell/paleta. Todos usam `data-slot` para estilos/testes e herdam os tokens.

Notas de API que outros arquivos dependem:

- `Button`: variantes `default|secondary|outline|ghost|destructive|link`; tamanhos
  `default|sm|lg|icon|icon-sm`.
- `Badge`: variantes `default|secondary|outline|destructive|positive|negative|warning|info`.
- `Card`: `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.
- `ToggleGroup` (Radix): `type="single"|"multiple"`, `value`, `onValueChange`; itens com
  `value` e `data-[state=on]` no visual segmentado.

## Bottom sheet (mobile)

<!-- BEGIN bottom-sheet -->

Primitivo `ui/bottom-sheet.tsx` para conteúdo modal abaixo de `lg` (no desktop use `Sheet`). Decisão e
alternativas: [2026-11-14-bottom-sheet-mobile](decisions/2026-11-14-bottom-sheet-mobile.md).

```tsx
<BottomSheet open={open} onOpenChange={setOpen}>
  <BottomSheetContent onOpenAutoFocus={...} onCloseAutoFocus={...}>
    <BottomSheetHeader title="Transação" onBack={page === "child" ? back : undefined} />
    <BottomSheetBody>{/* rola por dentro; respeita a safe area */}</BottomSheetBody>
  </BottomSheetContent>
</BottomSheet>
```

- **Base:** Radix Dialog (foco preso e devolvido, Esc, fundo inerte, `role="dialog"`, `aria-modal`,
  título pelo `BottomSheetHeader`). Fecha por arrastar a alça/cabeçalho, scrim, Esc e botão Fechar.
- **Arrasto:** só na região `data-bottom-sheet-drag` (alça + cabeçalho). Fecha com ≥ 120px ou
  arremesso ≥ 0,55 px/ms (limiares em `lib/sheet-drag.ts`); senão volta com transição. O corpo rola
  sozinho (`overscroll-behavior: contain`).
- **Duas páginas:** o consumidor troca o conteúdo e passa `onBack` ao cabeçalho; o título do diálogo
  segue a página. Mova o foco para o destino (`data-autofocus`) ao trocar.
- **Visual:** vidro (`--glass-sheet-bg`, `--glass-sheet-border`, `--glass-sheet-shadow`,
  `--sheet-scrim-bg`) com `backdrop-filter` só enquanto montado; sólido em
  `prefers-reduced-transparency` ou sem suporte. Cantos superiores de 28px, alça de 36×5px.
  Os tokens derivam do vidro do shell: borda = `--glass-border`, brilho interno =
  `--glass-highlight`. Diferenças intencionais: o fundo mistura `--card` (não `--background`) e é
  mais opaco (80% no claro, 82% no escuro, contra 46–58% das barras) para o texto e o formulário do
  sheet continuarem legíveis sobre qualquer conteúdo; a sombra projeta para cima (`-18px`) e há um
  scrim próprio (`--sheet-scrim-bg`).
- **Largura:** largura total em celular; de `sm` (640px) em diante, no máximo 560px e centralizado
  (`sm:mx-auto sm:max-w-[560px]`), mantendo cantos superiores arredondados e o arrasto.
- **Áreas seguras laterais:** cabeçalho, corpo e rodapés usam `max(<padding>, env(safe-area-inset-left|right))`,
  o mesmo padrão do shell, para o recorte da câmera (iPhone em paisagem) não cobrir o voltar/fechar.
- **Movimento:** só `transform`/`opacity`. Entrada em mola (`linear()`), saída em 260ms, sem animação
  com `prefers-reduced-motion`. O arrasto usa as variáveis `--bs-drag` e `--bs-scrim` (nunca
  `setState` por evento de ponteiro).
- **Teclado e safe area:** `visualViewport` alimenta `--bs-kb` (o sheet sobe e o campo em foco é
  rolado para a vista); o corpo tem `padding-bottom: max(1.25rem, env(safe-area-inset-bottom))`; a
  altura máxima é `min(86dvh, 100dvh − teclado − safe area do topo − 72px)`.
- **Alvos:** botões do cabeçalho de 44px (`size-11`) com rótulo (`Fechar`, `Voltar`).
- **Toasts e avisos:** o `Toaster` abaixo de `lg` fica acima da barra de abas (84px + safe area) e
  sobe ao topo enquanto há sheet aberto (`useBottomSheetOpen`). O sheet e o scrim (`z-50`) ficam
  acima da barra de abas (`z-40`). Toque no toast não fecha o sheet. O Radix marca o toast (irmão do
  portal) com `aria-hidden` com o sheet aberto, então avisos com ação, como "Desfazer", são
  mostrados **dentro** do sheet numa região `role="status"` (`data-slot="bottom-sheet-notice"`,
  8s) e não como toast; sem sheet aberto continua o toast. Erros e demais toasts seguem no sonner.
- **Campos de texto no sheet:** 16px (`text-base`) para o Safari iOS não dar zoom ao focar.
- **Usos:** detalhe da transação (`TransactionDetailMobile`) com seletor de categoria em grade de 3
  colunas (`CategoryGrid`, alvo ≥ 74px, selecionada destacada, "Remover categoria").

<!-- END bottom-sheet -->

## Shell autenticado

- Layout pathless `_app` com sidebar fixa (colapsável, estado em `lumen:sidebar-collapsed`) e
  barra de abas inferior no mobile (ver [Mobile](#mobile)); não há mais menu hamburguer.
- Sidebar: padding lateral de 12px; nos subitens de Contas/Cartões o nome trunca com reticências
  e o valor à direita fica inteiro (`shrink-0`) em 12px `muted-foreground`/`tabular-nums`, no
  formato compacto sem "R$" (`49,4 mil`, `1.062`). Com "Ocultar valores", o valor vira `••••`.
  O rodapé é uma faixa de 48px com ponto de status, texto (âmbar/vermelho quando há atenção),
  "Sincronizar agora" e "Recolher menu lateral" como botões de ícone com `aria-label`.
- Topbar de 56px (desktop) com breadcrumb em telas de detalhe, "Ocultar valores", `ThemeToggle` e menu da
  conta. O filtro de período **não** fica no topbar: cada página que depende dele o renderiza no
  `PageHeader`, com `ToggleGroup` (7D/30D/90D/12M) e calendário para o restante.
- Rotas: `/` (visão geral), `/accounts`, `/transactions`, `/credit-cards`, `/analytics`,
  `/connections`, `/settings` e `/more` (tela "Mais", só alcançável pela barra de abas no
  mobile). `/login` e `/setup` ficam fora do shell, com `AuthLayout` em
  coluna única: marca no topo, formulário de 400px centralizado vertical e horizontalmente,
  `ThemeToggle` no canto e fundo liso (sem gradiente nem painel de recursos).
- 404 dentro do shell e error boundary no root e no `_app` (tela cheia com retry).
- O período vive em search params (`?period=90d`, `?period=custom&from=…&to=…`), validado por Zod
  e preservado ao navegar pela sidebar.

## Mobile

Abaixo do breakpoint `lg` (1024px) o shell vira um "app": barra de abas inferior, barra superior
de vidro e a tela "Mais". O desktop não muda. Decisão em
[`docs/decisions/2026-11-14-navegacao-mobile-por-abas.md`](./decisions/2026-11-14-navegacao-mobile-por-abas.md).

**Barra de abas** (`MobileTabBar`): cápsula flutuante de vidro fixa no rodapé com 5 destinos
(Visão geral, Transações, Contas, Cartões, Mais). Aba ativa em `text-primary-ink` (ícone + rótulo de
11px) e `aria-current="page"`; alvos ≥ 44px. Os links preservam os search params (período), como
a sidebar. Rotas filhas herdam a aba do pai (`/accounts/$id` → Contas); Análises, Conexões e
Configurações acendem "Mais" (`activeMobileTab` em `lib/nav.ts`). Tocar na aba ativa, estando na raiz
dela, rola ao topo sem renavegar.

**Tela "Mais"** (`/more`): Análises, Conexões, Configurações, "Buscar ou ir para…" (paleta),
alternâncias de tema e ocultar valores, status/sincronização e a lista de instituições (o filtro
que a sidebar oferecia nos subitens de Contas). O filtro global de período e o selo de
demonstração já moram nos cabeçalhos das páginas. O tema saiu da topbar no mobile.

**Barra superior**: vidro, sem hambúrguer. Mostra o título compacto centralizado só depois que o
h1 do `PageHeader` sai da tela (`useTitleOffscreen`: scroll passivo + rAF, estado booleano, sem
re-render por pixel). Em telas de detalhe mostra "‹ Contas" à esquerda. Mantém ocultar valores e o
menu da conta.

**Telas da aba "Mais" x telas empilhadas**: Conexões, Análises e Configurações são telas da aba
"Mais" (acendem "Mais" na barra de abas): não têm botão voltar nem transição de push; volta-se pela
própria aba ou pelo gesto do sistema. Só os detalhes de conta e de cartão (`/accounts/$id`,
`/credit-cards/$id`) são telas empilhadas, com "‹ Contas"/"‹ Cartões" (ou o nome da entrada anterior)
na barra superior e a transição de empurrar/voltar.

**Áreas seguras**: a topbar usa `env(safe-area-inset-top)`; a barra de abas e o padding inferior
do `<main>` usam `env(safe-area-inset-bottom)`, e o conteúdo nunca termina sob a cápsula. Nas
laterais (paisagem com notch), o padding horizontal da topbar, do `<main>` e da barra de abas é
`max(<valor normal>, env(safe-area-inset-left/right))`, só abaixo de `lg`. O título compacto usa a
altura real da topbar (`getBoundingClientRect().bottom`), que inclui a área segura do topo. O
`viewport-fit=cover` vive em `apps/web/index.html`.

**Tokens de vidro** (`styles.css`, dark e light):

| Token | Uso |
| --- | --- |
| `--glass-bar-bg` | Fundo translúcido da barra superior |
| `--glass-tab-bg` | Fundo translúcido da barra de abas |
| `--glass-bar-solid`, `--glass-tab-solid` | Fallback sólido (sem `backdrop-filter` ou `prefers-reduced-transparency`) |
| `--glass-border`, `--glass-highlight`, `--glass-shadow-tab` | Borda, brilho interno e sombra da cápsula |
| `--primary-ink` | Azul de texto/ícone ativo (o primário puro fica ~4:1 no escuro) |

Utilitários `.glass-bar` e `.glass-tabbar`.

**Visão geral mobile** (decisão em [`docs/decisions/2026-11-16-visao-geral-mobile.md`](./decisions/2026-11-16-visao-geral-mobile.md)): padrões reutilizáveis nas demais telas.

- **Linha tocável** (`MOBILE_ROW_CLASS`): alvo ≥ 56px, pressionado por cor (`active:bg-accent`, sem transform), anel de foco por dentro. Cada link diz o destino com texto `sr-only` (`SrDestination`) e termina em `RowChevron`.
- **Links com período:** monte a search com `periodOnlySearch`/`transactionsLinkSearch` (`lib/overview-links.ts`); não repasse `q`, `tx` ou filtros de outra tela.
- **Scrub de gráfico** (`NetWorthScrubChart` + `lib/chart-scrub.ts`): `touch-action: pan-y`, marcador movido por `setAttribute` num rAF, callback só quando o ponto muda; o texto de destaque é o único estado por gesto.
- **Layouts por breakpoint:** `useIsDesktop()` lê `lg` de forma síncrona; use quando a composição muda, não só o CSS.

**Regras**:

- `backdrop-filter` só nesses dois elementos fixos. Nunca em cards, listas ou qualquer coisa que rola.
- Animações só com `transform` e `opacity` (120–260 ms); `prefers-reduced-motion` já zera as durações.
- Com `prefers-reduced-transparency: reduce` ou sem suporte, o chrome usa fundo sólido.
- O conteúdo das páginas segue o design system: cards planos, borda de 1px, sem sombra.
- `aria-label` em botões só de ícone; foco visível preservado.

<!-- BEGIN mobile-details -->

### Detalhes, voltar, transições e puxar para atualizar

Decisão e alternativas:
[2026-11-16-detalhes-mobile-voltar-transicoes-puxar](decisions/2026-11-16-detalhes-mobile-voltar-transicoes-puxar.md).

- **Detalhe de conta** (`/accounts/$accountId`): abaixo de `lg` é `AccountDetailMobile` (avatar da
  instituição, nome, saldo/fatura em destaque, entradas e saídas do período, lançamentos, atalho "Ver
  todas em Transações" já filtrado pela conta, evolução ou faturas e "Detalhes da conta"); de `lg` para
  cima segue o layout de desktop. As peças compartilhadas moram em `components/accounts/account-detail-parts.tsx`.
- **Cartões**: abaixo de `lg` cada cartão é uma linha tocável (`CreditCardRow`: fatura atual, vencimento em
  `warning` quando faltam ≤ 7 dias, uso do limite) que abre `/credit-cards/$accountId` (fatura, fechamento,
  vencimento, limite, faturas e lançamentos; a fatura escolhida vive em `?bill=`, trocada com `replace`).
  O seletor de cartão/fatura da própria página é do desktop.
- **Linhas tocáveis**: ≥ 44px, seta (`lg:hidden`), estado pressionado `active:bg-accent`.
- **Voltar**: o botão da barra superior é o voltar do histórico quando a trilha (`lib/nav-trail.ts`) sabe
  a entrada anterior, e leva o nome dela; sem trilha (deep link, reload) cai na lista de origem. Não há
  gesto próprio de borda: o do sistema (iOS/Android) faz o mesmo e a rolagem da lista é restaurada.
- **Transições** (`lib/view-transitions.ts` + CSS `:active-view-transition-type`): empurrar ao entrar num
  detalhe, voltar ao sair, 300 ms, só `transform`/`opacity`; abas trocam sem animação (`viewTransition={false}`
  nos links da barra de abas). Desligadas no desktop, com `prefers-reduced-motion`, sem suporte a tipos e
  (iOS) em voltas do gesto do sistema. Durante a transição o chrome fixo ganha nome próprio e fundo sólido.
- **Puxar para atualizar** (`components/layout/data-refresh.tsx`, no shell): só abaixo de `lg`, com a
  página no topo e gesto vertical claro; indicador fixo sob a barra, movido por `--ptr-y`/`--ptr-p` via ref
  (sem `setState` por toque), listeners passivos, limiar de 64px com resistência exponencial
  (`lib/pull-to-refresh.ts`). Atualizar = refazer as consultas ativas da API (nunca `POST /sync`); numa
  query infinita (Transações) só a primeira página (`lib/refresh-queries.ts`).
  `overscroll-behavior-y: none` (no `html`) desliga o recarregar nativo e o elástico do iOS. Sem gesto: botão "Atualizar dados" que
  aparece com foco e item no menu da conta; avisos em região `role="status"`.
- **Conexões**: ações de 44px (Reconectar/Atualizar na primeira linha, Histórico/Remover na segunda) e
  "Sincronizar agora" de largura total ao fim da lista.

<!-- END mobile-details -->

### Lista de Transações

**Lista mobile de Transações** (`transactions-mobile-list.tsx`; decisão em
[2026-11-16-transacoes-mobile](decisions/2026-11-16-transacoes-mobile.md)). Padrões novos e reutilizáveis:

- **Barra fixa de busca + chips** (`TransactionsMobileToolbar`): fundo sólido, altura fixa
  (`--tx-toolbar-h`, 100px), `top: var(--tx-topbar)` (barra superior + safe area). Campo de 44px com
  16px de fonte; chips de 34px com alvo de 44px (`::before`), `aria-pressed`, só o ativo mostra a
  contagem. Filtros ativos de conta/categoria são chips removíveis (`Remover filtro <nome>`).
- **Cabeçalho do dia fixo**: um elemento `sticky` por lista que cobre o cabeçalho real (a lista
  virtualizada é `absolute`, sem `sticky` por linha); `top: calc(var(--tx-topbar) + var(--tx-toolbar-h))`.
- **Alturas fixas** nas linhas virtuais (dia 36px, lançamento 64px) para o esqueleto não deslocar o layout.
- **Deslizar na linha** (`useSwipeToAct` + `lib/swipe-gesture.ts`): `touch-action: pan-y`, só assume o gesto
  quando claramente horizontal, ignora 24px junto às bordas, armado em 72px (fundo da ação vira `primary`),
  mola de 220ms de volta; seta ← é a alternativa de teclado. Nada de `setState` por ponteiro.
- **Gatilho flutuante** (`filters-trigger`): `bottom: calc(max(0.75rem, safe-area) + 4.5rem)` acima da barra de
  abas, `z-30`, em portal no `body`; sem `backdrop-filter`.
- **Um sheet por vez:** `?tx` e `?filters` na mesma URL abrem só o detalhe (`filtersOpen` exige `!tx`; fechar o detalhe
  também tira o `filters`). Abrir ou fechar sheet só muda search params: sem view transition e sem mudar o rótulo do voltar.
- **Puxar para atualizar:** o indicador (`z-index` 25) fica acima desta barra (20); o gesto não começa com o campo de busca focado.
- Utilitários `.bleed-x` (estende até as bordas anulando o padding do `<main>`, com safe area) e
  `.no-scrollbar` (faixa de chips rolável).

## Screenshots de revisão

Versionadas em [`screenshots/`](./screenshots) e geradas pelo Playwright:

```bash
# Windows PowerShell
$env:CAPTURE_SCREENSHOTS = "1"
pnpm --filter @fd/web exec playwright test e2e/screenshots.spec.ts
Remove-Item Env:CAPTURE_SCREENSHOTS
```

| Arquivo | Conteúdo |
| --- | --- |
| `shell-desktop-{dark,light}.png` | Visão geral, desktop 1440×900, ambos os temas |
| `shell-mobile-dark.png` | Visão geral, mobile 390×844 |
| `shell-mobile-more-dark.png` | Tela "Mais" no mobile, com a barra de abas |
| `{accounts,transactions,credit-cards,analytics,connections,settings}-desktop-{dark,light}.png` | Cada página, desktop, ambos os temas |
| `{accounts,transactions,credit-cards,analytics,connections,settings}-mobile-dark.png` | Cada página, mobile |
| `account-detail-desktop-{dark,light}.png`, `account-detail-mobile-dark.png` | Detalhe de conta |
| `login-desktop-{dark,light}.png`, `login-mobile-dark.png` | Tela de login |
| `components-desktop-dark.png` | Topo do showcase `/dev-ui` |
| `components-kpis-dark.png` | KPIs/gráficos do showcase |

O spec espera rede ociosa, ausência de skeletons visíveis e os dados demo antes de capturar
(nenhuma imagem deve sair em estado de carregamento).

## Showcase

`pnpm --filter @fd/web dev` e abra **`/dev-ui`** (somente em desenvolvimento). A página cataloga a
escala, tokens, tipografia, botões, formulários, pills, KPIs, gráficos (inclusive o estado vazio),
tabela, lista de transações, estados e overlays com dados fictícios rotulados como demonstração.
Ela não é incluída na navegação de produção e exibe um aviso quando acessada em build de produção.

> O caminho originalmente planejado era `/__ui`; o roteador file-based do TanStack trata
> arquivos com prefixo `_` como rotas sem path, então o showcase usa `/dev-ui`.

## Acessibilidade

- Landmarks (`header`, `nav`, `main`, `aside`), skip link no shell autenticado.
- Botões de ícone sempre com `aria-label`; ícones decorativos com `aria-hidden`.
- Formulários com `Label` associado, `aria-invalid` e mensagens com `role="alert"`.
- Overlays Radix: foco preso, `Esc` fecha, retorno de foco ao gatilho. Na paleta de comandos, o
  campo de busca mostra anel de foco (`focus-within:ring-2`) e o item selecionado troca o ícone
  para `foreground`.
- Status não depende só de cor: `StatusDot` aceita rótulo textual e `aria-label`.
- Controles de 28/32/36px mantêm alvo de toque adequado no mobile; a navegação vira `Sheet`.
- Contraste no tema claro sobre `card`: `muted-foreground` 7,4:1, `subtle-foreground` 4,8:1,
  `warning` 6,1:1 e `negative` 5,4:1 — todos acima de AA. No escuro, `muted-foreground` 7,4:1
  sobre `card` e `subtle-foreground` 4,0:1 (ícones, acima do mínimo de 3:1).
