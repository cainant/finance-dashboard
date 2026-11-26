# Refresh manual do provider no "Atualizar"

- **Data:** 2026-11-14
- **PR:** #77

## Contexto

O provider já implementava `refreshConnection` (`PATCH /items/:id` no Pluggy), mas nenhum código o
chamava: o botão "Atualizar" só relia o snapshot existente. Em conectores que aceitam o PATCH (sandbox
e Open Finance comum) isso deixava o botão sem efeito real; no MeuPluggy o conector responde
`400 MeuPluggy item cant be updated` e o provider já devolvia `{ refreshed: false, detail:
"meu_pluggy_reads_only" }` sem chamar a API.

## Decisão

`POST /api/connections/:id/sync?refresh=true` pede ao provider uma atualização do item antes da
leitura. A UI manda `refresh=true` só na primeira chamada de um sync manual e nunca durante uma fatia
de histórico (`PARTIAL_SYNC`), para não disparar `PATCH` em loop (limite de 20/min). Falha no refresh
(429, 5xx, conector que não suporta) é logada sem dados pessoais e **não** derruba o sync: a leitura
segue com o snapshot disponível e o webhook `item/updated` sincroniza o resultado quando o provider
terminar.

## Alternativas descartadas

- **Sempre chamar `refreshConnection`:** cada iteração do loop de fatias viraria um PATCH; no
  MeuPluggy é no-op, mas em sandbox/dev estouraria o limite de 20/min.
- **Body `{ refresh: true }`:** quebraria chamadas existentes sem corpo; query string é opcional e
  retrocompatível.
- **Esperar o item sair de `UPDATING` dentro do request:** consumiria subrequests e CPU do Free sem
  garantia de término; o webhook já resolve.

## Consequências

- MeuPluggy (produção) continua somente leitura; o botão "Atualizar" relê e a UI explica o ciclo de
  24h. O `detail` do provider fica no log do Worker (`sync_refresh_requested`).
- Conectores que suportam PATCH passam a buscar dados novos de verdade; o resultado chega no próximo
  sync/webhook, não necessariamente na resposta do POST.
- `syncConnectionQuery` (`refresh`) faz parte do contrato e é coberto por teste no serviço e na UI.
