# ADR 0004 — Origem única via Pages Function e service binding

- Status: aceito
- Data: 2026-11-10
- Contexto relacionado: [architecture.md](../architecture.md) (§Origem única, §Autenticação), [0001](0001-auth-github-oauth-sessao-d1.md)

## Contexto

A sessão é um cookie `HttpOnly` com `SameSite=Lax`. Para o navegador enviá-lo em toda chamada, frontend
e API precisam estar na mesma origem. Servir o SPA em `app.exemplo.com` e o Worker em
`api.exemplo.com` exigiria CORS com `credentials`, `SameSite=None` e uma lista de origens — mais
superfície de erro e de segurança para um app pessoal.

O Worker também não precisa de URL pública: só o frontend deve alcançá-lo.

## Decisão

- **Dev**: o Vite em `apps/web` faz proxy de `/api` para `http://127.0.0.1:8787` (wrangler dev). O
  navegador só conhece `127.0.0.1:5173`.
- **Produção**: Cloudflare Pages serve `apps/web/dist` e uma Pages Function em
  `apps/web/functions/api/[[path]].ts` encaminha `/api/*` para o Worker via **service binding** `API`.
  A Function repassa método, headers, body e query string, e devolve a resposta do Worker sem reescrever
  o cookie. O binding precisa existir no projeto Pages e o Worker precisa aceitar invocação direta por
  binding, não só por HTTP.

## Consequências

- Positivas: uma única origem em todos os ambientes, cookie sem CORS e sem `SameSite=None`; o
  `SameSite=Lax` continua valendo.
- Positivas: o Worker não precisa ser público, o que reduz a superfície de ataque e dispensa autenticação
  de borda na API.
- Positivas: o frontend chama caminhos relativos (`/api/...`), então o mesmo código funciona em dev e em
  produção sem variável de base URL.
- Negativas / custos: a API precisa ser deployada antes do web quando o contrato muda; um binding ausente
  ou apontando para outro Worker quebra o app inteiro com 5xx na Function.
- Negativas / custos: a Pages Function adiciona um hop e um ponto de configuração fora do código; erros
  de proxy (headers, streaming, body) são mais difíceis de depurar do que um CORS mal configurado.
- Negativas / custos: `workers_dev` pode ser desativado como hardening, mas então testar a API
  isoladamente exige `wrangler dev` ou o domínio do Pages.
- Alternativas descartadas: CORS com credenciais entre subdomínios; expor o Worker publicamente e usar
  `SameSite=None`; proxy reverso em outro provedor; servir o SPA pelo próprio Worker (perde o cache e os
  assets estáticos do Pages).
