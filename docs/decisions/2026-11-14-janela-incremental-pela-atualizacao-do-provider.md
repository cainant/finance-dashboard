# Janela incremental ancorada no frescor do provider

- **Data:** 2026-11-14
- **PR:** #77

## Contexto

O sync incremental buscava transações desde `connections.last_synced_at − 7 dias`. Esse campo é
gravado quando o Lumen **lê** o provider, não quando o provider **atualiza** o item. No MeuPluggy o
item é um espelho da conexão em `meu.pluggy.ai`, que atualiza no ciclo de 24h do proxy e não aceita
`PATCH /items` (confirmado em produção: `400 MeuPluggy item cant be updated`). Se o MeuPluggy ficar
mais de 7 dias sem atualizar — ou se o extrato chegar com data retroativa —, uma leitura local
recente ancora a janela depois do fato e a transação nunca é importada. A produção de 14/11/2026
mostrou que o volume atual ainda cabe na janela (3 conexões, 1.630 transações em 365 dias, nenhuma
lacuna real após descontar o fuso), mas o risco cresce a cada dia sem atualização do proxy.

## Decisão

A janela incremental começa em `min(last_synced_at, provider_updated_at, history_synced_at)` − 7
dias, limitada a 365 dias. `provider_updated_at` guarda `Item.lastUpdatedAt` (o instante do snapshot
do provider), persistido a cada sync; o menor valor entre as referências só alarga a janela, então
um snapshot antigo obriga a reler o intervalo desde a última atualização conhecida, em vez de confiar
na hora da leitura. Conta sem `history_synced_at` continua usando 365 dias.

## Alternativas descartadas

- **Só `last_synced_at` (status quo):** perde transação retroativa quando o provider fica dias sem
  atualizar e depois entrega tudo de uma vez.
- **Só `provider_updated_at`:** numa conexão nova ele ainda não existe; e o item pode atualizar entre
  a leitura e a gravação, deixando um buraco. O menor entre os dois cobre os dois lados.
- **Recomeçar 365 dias a cada sync:** caberia no orçamento de subrequests, mas gastaria CPU do
  Workers Free e páginas do provider sem necessidade.

## Consequências

- `connections.provider_updated_at` é nullable (`0006_connections_provider_updated_at.sql`); conexões
  antigas caem no fallback `last_synced_at` até o primeiro sync gravar o valor.
- Enquanto o item não atualiza, a janela fica parada no último snapshot — o sync relê o mesmo
  intervalo a cada ciclo (custo pequeno) em vez de avançar e perder dados.
- O card de Conexões passa a mostrar "Dados do banco atualizados …" separado de "Última sincronização
  …", para o usuário distinguir leitura de frescor.
- Não muda o limite de 45 subrequests por invocação: uma janela maior só ocupa mais páginas, e o
  cursor pendente (`_pending`) continua fatiando o histórico entre ciclos.
