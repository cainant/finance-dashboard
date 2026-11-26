# Decisões

Uma decisão nova = um arquivo novo em `docs/decisions/`, nomeado pelo dia do merge e por um slug curto:
`2026-11-13-fatura-corrente-derivada.md`. Nenhum PR edita o registro de outro PR, então duas threads
abertas ao mesmo tempo não conflitam aqui.

O histórico anterior a 2026-11-12 fica no registro de [architecture.md](../architecture.md), que segue como
arquivo morto. A regra existe porque, na rodada de seis threads em paralelo, quase todo conflito foi em
`docs/architecture.md`: cada PR acrescentava uma linha no mesmo parágrafo.

## Quando criar um arquivo

- mudou comportamento visível (contrato de API, regra de negócio, cálculo, tela) e a escolha não é óbvia pelo código;
- escolheu entre alternativas e a razão vale para quem ler daqui a seis meses;
- a decisão é estrutural (auth, provider, custo, dinheiro): o arquivo fica curto e referencia um ADR em [../adr/](../adr/README.md).

Não crie arquivo para refactor sem mudança de comportamento, correção de bug já provada pelo teste ou
mudança de estilo.

## Nome

`<AAAA-MM-DD>-<slug>.md`, data do merge e slug em kebab-case: `2026-11-13-fatura-corrente-derivada.md`.
Sem numeração sequencial — dois PRs simultâneos escolheriam o mesmo número e conflitariam.

## Conteúdo

Copie [\_template.md](_template.md) e preencha título, data, PR, decisão em uma frase, contexto,
alternativas descartadas e consequências. Números reais (linhas lidas, valores, datas) valem mais que
adjetivos.

## Regras

- Não se reescreve um arquivo já mergeado: decisão que muda o rumo é outro arquivo, que cita o anterior
  ("substitui `2026-11-13-...`"). Correção de link ou de redação pode ser direta.
- `docs/architecture.md` continua a fonte da verdade do desenho atual. PR que muda contrato, tabela ou
  fluxo atualiza a seção correspondente no mesmo PR — sem acrescentar linha no registro histórico.
- O arquivo entra no mesmo PR da mudança, não num PR separado.
