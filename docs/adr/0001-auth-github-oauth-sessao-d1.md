# ADR 0001 — Auth própria com GitHub OAuth e sessão opaca em D1

- Status: aceito
- Data: 2026-11-10
- Contexto relacionado: [architecture.md](../architecture.md) (§Autenticação, §Origem única), [auth-on-workers.md](../research/auth-on-workers.md)

## Contexto

App pessoal, single-user: não existe cadastro público, só o dono acessa. A API é um Worker com D1 e a
sessão viaja em cookie na mesma origem do frontend. A restrição de custo zero exclui Workers Paid, e o
plano Free oferece 10 ms de CPU por request. O login por senha com PBKDF2-SHA256 custa cerca de 40 ms
nas 100.000 iterações permitidas pelo workerd (teto do runtime; 100.001 lança `NotSupportedError`, e
`wrangler dev`/Node não reproduzem o erro) — estoura o limite do Free com `exceededCpu` mesmo para um
único usuário.

## Decisão

- **Produção**: GitHub OAuth. `GET /api/auth/github` redireciona com `state` em cookie HttpOnly;
  `GET /api/auth/github/callback` troca o code via `fetch`, lê `/user` e só aceita se o `login` estiver
  em `ALLOWED_GITHUB_LOGINS` (secret em produção / var em dev, separada por vírgula). Cria/atualiza `users.github_login` e emite a
  sessão. CPU próxima de zero, sem cartão.
- **Dev/teste**: senha habilitada só com `ENABLE_PASSWORD_LOGIN=true` (default true em dev, false em
  produção). PBKDF2-SHA256 com exatamente `100_000` iterações, salt aleatório e formato
  `pbkdf2$<iter>$<saltB64>$<hashB64>`, que permite migração futura.
- **Sessão**: token aleatório de 32 bytes (base64url) no cookie `fd_session`; o D1 guarda apenas o
  SHA-256 como `sessions.id`. Expira em 30 dias com renovação deslizante. Cookie `HttpOnly; Secure` em
  produção; `SameSite=Lax; Path=/`. A rotação de token no login/logout é recomendação de segurança
  registrada em [auth-on-workers.md](../research/auth-on-workers.md), não um requisito da v1.
- **Rate limit** do login por senha em tabela D1 (`login_attempts`), nunca em KV — eventually consistent
  e com teto de escritas. `GET /api/auth/providers` informa à UI os métodos habilitados.

## Consequências

- Positivas: zero dependência externa de identidade, nenhuma tabela ou migration de terceiro, CPU
  irrelevante no login de produção, usuário e sessão dentro do D1; o formato do hash e o `state` em
  cookie permitem trocar iterações ou provedor sem quebrar sessões existentes.
- Negativas / custos: a segurança é nossa (rotação, rate limit, reset); o login de produção depende do
  GitHub; 100k iterações ficam abaixo das 600k recomendadas pela OWASP, o que é aceitável só porque o
  método existe apenas em dev/teste. `ALLOWED_GITHUB_LOGINS` é mantida à mão.
- Cloudflare Access é **complemento opcional**, não auth do app: protege o domínio do Pages na borda
  (free até 50 usuários), mas não cria usuário no D1, atrapalha o dev local e não cobre chamadas via
  service binding.
- Alternativas descartadas: **Better Auth** (4 tabelas, `nodejs_compat`, instância por request e
  migrations paralelas ao drizzle-kit — peso desproporcional para 1 usuário); **Clerk** (dependência
  externa, hop de rede, sessão fixa de 7 dias no free); **Lucia** (deprecada em março/2025);
  **Cloudflare Access como substituto** (não é auth da aplicação).
