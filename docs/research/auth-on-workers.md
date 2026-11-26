# Autenticação em Cloudflare Workers para app pessoal (single-user)

Avaliação das opções para o `apps/api` (Worker + Hono + D1), em **2026-11-10**, contra a decisão já
registrada em `docs/architecture.md` ("auth própria: PBKDF2 + sessão em D1"). Inclui a verificação do
limite de iterações do PBKDF2 no runtime da Cloudflare, que **contradiz parcialmente** a redação atual
da arquitetura.

---

## 1. Requisitos

- Um único usuário (o dono do app), sem cadastro público; `POST /api/auth/setup` só cria o primeiro.
- Sessão por cookie `HttpOnly`, mesma origem (Pages Function + service binding).
- Sem dependência externa, sem custo adicional, deployável em um Worker.
- Precisa funcionar com D1 e sem Node APIs "pesadas".

---

## 2. Opções

| Opção | Como funciona | Prós | Contras | Veredito |
|---|---|---|---|---|
| **PBKDF2 + D1 (WebCrypto)** | hash no Worker, sessão em tabela `sessions` | zero deps, 1 tabela, controle total, funciona em qualquer plano pago, sem vendor lock-in | você é dono da segurança (reset, rotação, rate limit); PBKDF2 é o KDF mais fraco contra GPU | **Recomendado** (com os ajustes da §5) |
| **Better Auth** | lib TS, adapters (Drizzle/D1 nativo), tabelas próprias (`user`, `session`, `account`, `verification`) | recursos prontos (OAuth, MFA, passkeys), D1 de primeira classe desde a v1.5 | ~4 tabelas + CLI/migrations, `nodejs_compat` para AsyncLocalStorage, instanciação por request (binding D1 só existe no contexto da request), superfície grande para 1 usuário | Overkill |
| **Lucia** | era uma lib de sessão | API simples | **deprecada em março/2025**; o site oficial agora distribui um único arquivo `code/auth_session.ts` como substituto | Não usar a lib; a "substituição de 1 arquivo" é, na prática, roll-your-own |
| **Clerk** | SaaS de identidade | pronto, UI, MFA | dependência externa + hop de rede, sessão fixa de 7 dias no plano free, `nodejs_compat`, custo a partir de 50k MRU (irrelevante aqui) e dados de auth fora do D1 | Overkill / fora do requisito "zero dependência externa" |
| **Cloudflare Access (Zero Trust)** | identity-aware proxy na borda | **grátis até 50 usuários**, sem código, protege o domínio inteiro, MFA/IdP | não é auth da aplicação (não há usuário no D1); exige time domain + IdP (ou one-time PIN); atrapalha dev local; não serve para chamadas internas/service binding | **Complemento**, não substituto |

Referências: [Lucia](https://lucia-auth.com/) (aviso de depreciação),
[Better Auth 1.5 / D1 nativo](https://better-auth.com/blog/1-5),
[Better Auth — database](https://better-auth.com/docs/concepts/database),
[Clerk pricing](https://clerk.com/pricing),
[Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access) (free até 50 usuários).

### 2.1 Por que não Better Auth, na prática

A v1.5 aceita o binding direto:

```ts
export default {
  async fetch(request, env) {
    const auth = betterAuth({ database: env.DB }); // D1 binding
    return auth.handler(request);
  },
};
```

Funciona, mas: (a) o binding só existe dentro da request, então **não** dá para criar o `auth` no escopo
do módulo; (b) D1 não tem transações interativas (a lib usa `batch()`); (c) exige `nodejs_compat` para
AsyncLocalStorage; (d) traz 4 tabelas e um fluxo de migrations paralelo ao drizzle-kit. Para 1 usuário,
o custo de manutenção supera o benefício.

---

## 3. Limite de iterações do PBKDF2 no Workers — **confirmado: 100.000**

### 3.1 A prova

O código do runtime (`workerd`) tem um cap explícito:

```cpp
// src/workerd/api/crypto-impl-pbkdf2.c++
// Note: The user could DoS us by selecting a very high iteration count...
// this is an intentional non-conformity.
JSG_REQUIRE(iterations <= 100000, DOMNotSupportedError,
    "PBKDF2 iteration counts above 100000 are not supported (requested ", iterations, ").");
```

Fonte: [crypto-impl-pbkdf2.c++](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto-impl-pbkdf2.c%2B%2B)
— o mesmo cap existe no `node:crypto` (`Pbkdf2 failed: iteration counts above 100000 are not supported`).

Confirmações independentes:

- Resposta de engenheiro da Cloudflare no fórum: *"100,000 is the maximum number of supported iterations
  for PBKDF2. This may change in future."*
  ([community.cloudflare.com](https://community.cloudflare.com/t/web-crypto-api-derivekey-issues/474035/2), 2023).
- Issue aberta até hoje: [workerd#1346 — "crypto: 100,000 iterations of PBKDF2 is insecure"](https://github.com/cloudflare/workerd/issues/1346).
- Relato de produção em **out/2026**: `NotSupportedError: Pbkdf2 failed: iteration counts above 100000
  are not supported (requested 240000)`, com `compatibility_date = 2026-10-04`
  ([community](https://community.cloudflare.com/t/pbkdf2-iteration-limit-on-workers-free/965725)).

### 3.2 O que **não** muda o limite

- `compatibility_date` / compatibility flags: o cap não é versionado.
- Plano Free vs Paid: o teto é o mesmo; o que muda é o **CPU time** (§4).
- `wrangler dev` e Node **não** aplicam o limite. É por isso que testes locais passam com 600k e a
  produção quebra em `deriveBits`. Qualquer teste de hash precisa ter uma asserção explícita
  `iterations <= 100_000`.
- Existe um PR merged ([workerd#7550](https://github.com/cloudflare/workerd/pull/7550), set/2026) que
  sobe o **default** do limit-enforcer para 1.000.000, e o `workerd` open-source já retorna "sem limite".
  Isso é infraestrutura, **não** uma garantia de produção: o relato de out/2026 mostra o erro em
  produção. **Não projetar acima de 100.000.**

### 3.3 Consequência para a arquitetura

`docs/architecture.md` diz "PBKDF2-SHA256 (WebCrypto, **>= 100k iterações**)". Isso não é folga: é
exatamente o teto. `100_001` já lança `NotSupportedError`. A recomendação é fixar **100.000** e registrar
o número na string do hash (`pbkdf2$<iter>$<saltB64>$<hashB64>`) para permitir migração futura — o que
o formato já prevê.

Contexto de segurança: OWASP recomenda **600.000** iterações para PBKDF2-HMAC-SHA256
([Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).
100.000 está abaixo. Para um app de 1 usuário, os mitigantes são: senha longa (não uma senha de 8
caracteres), rate limit agressivo no login, e — opcionalmente — um **pepper** (HMAC-SHA256 da senha com
`SESSION_SECRET` antes do PBKDF2), que devolve parte da resistência perdida sem depender de iterações.
Se um dia o cap subir, o formato do hash permite re-hash no próximo login.

---

## 4. CPU time: o problema silencioso do Workers Free

| Plano | CPU por request |
|---|---|
| Workers Free | **10 ms** |
| Workers Paid | 5 min (default **30 s**) |

Fonte: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Benchmark público do próprio PR que tentou subir o cap: 600.000 iterações ≈ **250 ms** de CPU em
produção → **~40 ms para 100.000**. Isso significa que **login e setup estouram os 10 ms do plano Free**
(erro 1102, `exceededCpu`), mesmo com o hash em 100k. O autor do PR é explícito: *"this doesn't work on
Workers Free, but 100,000 iterations didn't work there either."*

**Portanto:** rodar este dashboard em Workers Free é incompatível com PBKDF2 no login. Opções:

1. **Workers Paid (US$ 5/mês)** — resolve, e ainda libera Cron Triggers com 30 s de CPU (o sync de 6h
   agradece). **Recomendado.**
2. Manter Free e trocar o login para **passkey/WebAuthn** (sem KDF caro) — muda o escopo.
3. Proteger tudo com **Cloudflare Access** e manter a senha só como segundo fator — Access faz o
   trabalho pesado na borda; ainda assim o `setup` precisa rodar uma vez.

---

## 5. Recomendação (consistente com a arquitetura, com 4 ajustes)

Manter **auth própria**: PBKDF2-SHA256 + sessão opaca em D1. É a escolha certa para 1 usuário e para o
requisito "zero dependência externa". Ajustes necessários:

1. **Iterações = 100.000, fixas, com asserção em teste.**
   Corrigir a redação da arquitetura de ">= 100k" para "= 100k (teto do runtime)". Guardar o número no
   hash para permitir upgrade futuro.

2. **Rodar em Workers Paid.** O login não cabe nos 10 ms de CPU do Free. Registrar isso como requisito
   de deploy (ou trocar para passkey, se Free for inegociável).

3. **Rate limit de login fora do KV.** KV é *eventually consistent* (escritas podem demorar até ~60 s
   para propagar globalmente), então um contador em KV não segura força bruta. Usar:
   - **Cloudflare Rate Limiting rule** na rota `POST /api/auth/login` (borda, antes do Worker), e/ou
   - contador em **D1** (`login_attempts` com janela deslizante) — consistente, custo desprezível.
   Manter o KV apenas como cache/otimização, como a arquitetura já sugere ("opcional").

4. **Endurecer a sessão:**
   - token de 32 bytes (base64url) gerado com `crypto.getRandomValues`; no D1 só o **SHA-256**;
   - comparar o digest calculado com o do banco com uma função de tempo constante (o WebCrypto **não**
     expõe `timingSafeEqual`; comparar 32 bytes de SHA-256 com XOR acumulado é suficiente — o token é
     aleatório de 256 bits, então o risco de timing é desprezível de qualquer forma);
   - cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, e opcionalmente prefixo **`__Host-`**
     (`__Host-fd_session`) — exige `Secure`, `Path=/` e **sem** `Domain`, o que já é o caso; ganha
     proteção contra fixação por subdomínio;
   - rotação do token no login e no logout (invalidar sessões antigas do mesmo `user_agent`);
   - **renovação deslizante com throttle**: atualizar `expires_at` no máximo 1x/dia por sessão, para não
     escrever no D1 a cada request;
   - `expires_at` absoluto máximo (ex.: 90 dias) além do deslizante de 30.

**Cloudflare Access**: manter como recomendação documentada de produção (como já está), não como
substituto. Com Pages + service binding, o Worker não é público, então colocar Access na frente do
domínio do Pages cobre o app inteiro com custo zero (free até 50 usuários) e não conflita com o cookie
de sessão. Só não funciona bem em dev local e não deve ser obrigatório para o app subir.

**Better Auth, Clerk e Lucia: descartados** — o primeiro e o terceiro por peso/depreciação, o segundo por
ser dependência externa paga para um problema de 1 usuário.

---

## 6. Resumo das mudanças a registrar em `docs/architecture.md`

| Item | Hoje | Deveria ser |
|---|---|---|
| Iterações PBKDF2 | `>= 100k` | `= 100_000` (teto do workerd; >100k lança `NotSupportedError`) |
| Plano Cloudflare | não especificado | Workers **Paid** (login não cabe em 10 ms de CPU do Free) |
| Rate limit de login | "KV, opcional" | Cloudflare Rate Limiting na rota + contador em D1 (KV é eventually consistent) |
| Cookie | `fd_session` | opcional `__Host-fd_session`, com rotação no login e renovação deslizante com throttle |
| Access | "recomendação adicional" | manter como recomendação de produção (free ≤ 50 usuários) |

Nada disso invalida a decisão "auth própria"; só corrige o número e o requisito de plano.

---

## 7. URLs consultadas

- https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto-impl-pbkdf2.c%2B%2B
- https://github.com/cloudflare/workerd/issues/1346
- https://github.com/cloudflare/workerd/pull/7550
- https://community.cloudflare.com/t/web-crypto-api-derivekey-issues/474035
- https://community.cloudflare.com/t/pbkdf2-iteration-limit-on-workers-free/965725
- https://developers.cloudflare.com/workers/platform/limits/
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://lucia-auth.com/
- https://better-auth.com/blog/1-5
- https://better-auth.com/docs/concepts/database
- https://clerk.com/pricing
- https://www.cloudflare.com/zero-trust/products/access
