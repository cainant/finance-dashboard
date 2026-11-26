# Categoria de outra natureza no seletor de categoria

- **Data:** 2026-11-14
- **PR:** #68

## Contexto

O seletor de categoria da tabela de transações filtra as opções pela natureza do
lançamento (`kindForType(transaction.type)`) para não classificar receita como
despesa. O sync, porém, aplica categorias de outra natureza: `PIX ENVIADO -
<terceiro>` é `type: expense` e recebe a categoria de sistema "Transferências"
(`kind: transfer`) pela regra de descrição em
`packages/financial-providers/src/pluggy/mappers.ts`; o dataset demo gera a mesma
linha (`packages/financial-providers/src/demo/generate.ts`, `categoryHint:
"transferencias"` com `type: "expense"`).

Resultado no app: o gatilho mostrava "Transferências", mas a lista só tinha
categorias de despesa — nada aparecia marcado e, depois de trocar para uma
categoria válida, não havia como voltar à original.

## Decisão

O seletor fixa no topo a categoria de outra natureza que a linha tem: a atual
(marcada, `aria-selected="true"`) ou, depois de uma troca, a que ela tinha antes
(`aria-selected="false"`), nas duas com a natureza indicada num selo discreto e
na descrição acessível. As demais opções continuam filtradas pela natureza do
lançamento e pela busca; a fixada ignora a busca para continuar alcançável.

A categoria de origem vive acima da tabela
(`apps/web/src/components/transactions/category-origins.ts`,
`useCategoryOrigins`), não dentro do seletor: no TanStack Table v9 os
`cell` inline são funções novas a cada recálculo do `useMemo` de colunas — e o
memo depende de `isMutating` —, então a célula é remontada em toda mutação e
qualquer `useState` do seletor se perderia. Pelo mesmo motivo o callback de troca
de categoria recebe a transação e não lê a lista dentro de si.

## Alternativas descartadas

- **Listar as categorias de `kind: transfer` para lançamentos de despesa:** o
  filtro por natureza existe para impedir receita virando despesa e vice-versa;
  abrir a lista inteira devolveria o erro que ele evita.
- **Corrigir a regra de Pix em `mappers.ts` e no sync:** a categoria manual do
  usuário pode ser de outra natureza de qualquer forma, e mexer na classificação
  do sync muda dados já gravados — fora do escopo deste PR.
- **Guardar a origem dentro do `CategoryPicker`:** implementado e descartado no
  e2e — a célula é remontada quando `isMutating` muda e a origem desaparecia
  justamente depois da troca.

## Consequências

- Um estado novo acima da tabela (`useCategoryOrigins`, em
  `apps/web/src/components/transactions/category-origins.ts`), compartilhado pela
  página de transações, pela lista de recentes da Visão geral e pelo painel de
  detalhe. Ele cresce só com as linhas em que o usuário trocou a categoria e não
  é persistido: **recarregar a página perde a origem** e, com ela, o caminho de
  volta — a categoria atual continua fixada e marcada. A troca manual também é
  reversível pelo "Desfazer" do toast do painel; a origem é a rede de segurança
  depois que o toast some.
- O callback de troca de categoria recebe a transação inteira (e não o id) para
  a página registrar a origem sem ler a lista: ele entra no memo das colunas da
  tabela e precisa de identidade estável, senão cada refetch remonta as células e
  fecha o popover no meio do uso.
- O seletor passou a ter duas listas: `pinned` (outra natureza) e `options`
  (mesma natureza), cobertas por `category-picker-options.test.ts` e
  `category-origins.test.ts`; o e2e `category-picker.spec.ts` prova o ciclo
  completo numa linha Pix real do demo, na tabela e no painel.
- A sonda `findRowWithSelectableCategory` de `apps/web/e2e/transactions-table.spec.ts`
  (PR #67) foi removida: toda linha tem a categoria atual na lista.
