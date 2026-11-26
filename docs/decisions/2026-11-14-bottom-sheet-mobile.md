# Bottom sheet no mobile: Radix Dialog + gesto próprio

- **Data:** 2026-11-14
- **PR:** #74

## Contexto

Abaixo de `lg` o detalhe da transação era o mesmo painel lateral do desktop (Sheet de 420px em
largura total, com Anterior/Próxima/Fechar no rodapé). Não parecia app nativo: sem alça, sem
arrastar para fechar, sem grade de categorias e com o popover do seletor apertado numa tela de
390px. O protótipo mobile D aprovado define o
comportamento: sheet que sobe com mola, arrasto para fechar, detalhe em lista e categoria em grade.
As etapas seguintes (filtros) vão reaproveitar o mesmo sheet.

## Decisão

O primitivo `ui/bottom-sheet.tsx` é construído sobre o **Radix Dialog** (o mesmo do `ui/sheet.tsx`)
com um gesto de arrasto próprio, sem biblioteca nova:

- Radix entrega `role="dialog"`, título associado, foco preso e devolvido ao gatilho, Esc e fundo
  inerte (`aria-hidden` nos irmãos, `pointer-events` e rolagem bloqueados). `aria-modal="true"` é
  acrescentado por nós.
- O arrasto vale só na região da alça/cabeçalho (`data-bottom-sheet-drag`, `touch-action: none`);
  o corpo rola nativamente, então o gesto nunca disputa a rolagem interna. Ele escreve a variável CSS
  `--bs-drag` (e `--bs-scrim`) direto no elemento, sem `setState` por evento; o `transform` do sheet
  lê a variável, e a animação de saída parte do valor atual dela.
- Fecha por distância (≥ 120px) ou arremesso (≥ 0,55 px/ms com ≥ 16px). Os limiares e a velocidade
  são funções puras em `lib/sheet-drag.ts`, com testes.
- Só `transform` e `opacity` animam; a mola é um `linear()` em CSS (sem biblioteca de animação).
  `backdrop-filter` só existe com o sheet montado, e cai para fundo sólido em
  `prefers-reduced-transparency` ou sem suporte; `prefers-reduced-motion` desliga a animação.
- O teclado virtual é medido por `visualViewport` (`--bs-kb`): o sheet sobe e o campo em foco é
  rolado para a vista. O rodapé respeita `env(safe-area-inset-bottom)`.
- Dois níveis: `BottomSheetHeader` aceita `onBack`; o consumidor troca o conteúdo (o título do
  diálogo acompanha a página).
- Abaixo de `lg` o detalhe da transação usa o sheet; de `lg` para cima nada muda (painel lateral).
  O contrato de URL (`?tx`) é o mesmo e o "voltar" do navegador fecha o sheet.
- Toasts: o sonner sobe para o topo enquanto um sheet está aberto (o sheet limita a altura para
  deixar a faixa livre) e fica acima da barra de abas inferior (84px + safe area) quando não há
  sheet. O toque no toast não conta como clique fora do sheet.
- Acessibilidade do "Desfazer": o Radix modal põe `aria-hidden` em tudo que é irmão do portal, e o
  `<section>` do sonner é filho do `body`; com o sheet aberto, VoiceOver/TalkBack não anunciariam
  "Categoria: X" nem alcançariam "Desfazer". Escolha: com o sheet aberto, o aviso e o "Desfazer"
  moram **dentro** do sheet (região `role="status"` + botão no foco do diálogo, 8s) e o toast do
  sonner não é emitido; sem sheet (ou depois que ele fechou) o toast continua. É mais simples e
  robusto que desfazer o `aria-hidden` do sonner ou mover o `Toaster` para dentro do diálogo, e
  não duplica o aviso (um só aviso visível por vez).
- Largura: celular em largura total; de `sm` em diante `max-w-[560px]` centralizado. Cabeçalho,
  corpo e rodapés respeitam as áreas seguras laterais (`env(safe-area-inset-left|right)`).
- Voltar do navegador com a página "Categoria" aberta fecha o sheet inteiro (decisão do
  orquestrador): a página filha é estado local do sheet, e o contrato de URL continua sendo só
  `?tx`. Aceito de propósito para não criar uma segunda chave de URL.

## Alternativas descartadas

- **`vaul` (Drawer do shadcn):** traz o gesto pronto, mas é uma dependência a mais por cima do mesmo
  Radix Dialog, com animação e arrasto que controlamos menos (o arrasto também começa pelo corpo,
  e a regra do dono é manter a rolagem interna livre). Não medimos o peso no bundle; sem a lib não
  há peso novo além do código próprio (um arquivo de ~400 linhas e o CSS do bloco `bottom-sheet`).
- **Biblioteca de animação (framer-motion e similares):** pesada para um único gesto, e a regra é
  animar só `transform`/`opacity` com listeners baratos.
- **`Sheet` `side="bottom"` existente:** não tem arrasto, alça nem mola, e sua animação é a
  `tw-animate-css` genérica.

## Consequências

- O arrasto só começa pela alça/cabeçalho, não pelo corpo rolado até o topo (como no iOS nativo).
  Se a etapa dos filtros pedir esse gesto, o ponto de extensão é o `handlePointerDown`.
- O detalhe da transação tem dois renderizadores (`TransactionDetailSheet` escolhe pelo
  breakpoint); a edição de nota/categoria é compartilhada em `use-transaction-editing.ts`.
- "Ver lançamentos parecidos" leva a Transações com `q` = estabelecimento (ou descrição) e limpa
  os filtros de conta, categoria, tipo e "sem categoria"; o período fica.
- O `Toaster` passa a depender do estado de sheet aberto (`bottom-sheet-state.ts`).
