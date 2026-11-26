# Tela de Metas: rascunho local, percentual como fonte e grupo por transação no detalhe

- **Data:** 2026-11-18
- **PR:** #84

## Contexto

Segundo PR das metas por grupo (o primeiro, #83, criou dados e API — ver
`docs/decisions/2026-11-17-metas-por-grupo.md`). A tela segue o modelo enviado pelo usuário: renda de
referência, alternância Porcentagem/Valor (R$), donut da distribuição e um controle por grupo.

## Decisão

- **Rota `/budget` ("Metas")**, na sidebar depois de Análises e, no mobile, sob a aba "Mais".
- **Rascunho local, um "Salvar metas"**: sliders, campos, nomes, cores, criar e remover grupo mexem só
  no rascunho; o botão grava a lista inteira (`PUT /api/budget`). Salvar fica bloqueado acima de 100%,
  com nome vazio ou sem grupos — as mesmas regras do contrato (`draftProblem` espelha
  `updateBudgetBody`). "Desfazer alterações" volta ao salvo (no lugar de "Resetar valores", que
  sugeria voltar aos padrões).
- **Percentual é a fonte**: no modo Valor (R$) o valor digitado vira pontos-base
  (`bpsForCents`) e o percentual é o que se grava; o modo fica desabilitado sem renda de referência.
  O slider anda de 1 em 1%; o campo aceita duas casas decimais.
- **Renda salva à parte** ("Salvar renda"), sem descartar o rascunho dos grupos.
- **Categorias por grupo** salvam na hora, uma linha por categoria de despesa.
- **Detalhe da transação** (painel e bottom sheet) ganha "Grupo de metas": "Da categoria: <grupo>"
  (sem exceção) ou um grupo fixo só para aquele lançamento, e a linha "Parcela n de N" quando há
  parcelamento.
- Cores dos grupos são dado do usuário (como as das categorias) e entram por `style`; o trilho do
  slider usa o token `--muted`.

## Alternativas descartadas

- **Salvar a cada mudança do slider:** gravaria estados intermediários acima de 100% (que a API
  rejeita) e geraria uma escrita por arrasto.
- **Slider do Radix:** pacote novo só para isso; o `input type="range"` nativo, estilizado, é
  acessível por teclado e leitor de tela.

## Consequências

- Nada muda na API. O realizado × meta e o modo "guardar para a fatura" ficam para os próximos PRs.
