# Registro de decisões de arquitetura (ADR)

Decisões estruturais do Lumen Finance, extraídas do registro em [architecture.md](../architecture.md).
Cada ADR retrata a decisão na data em que foi tomada. Mudança de rumo gera um ADR novo que substitui o
anterior; não se reescreve o histórico. Decisões do dia a dia (regra de negócio, contrato, cálculo)
ficam em [../decisions/](../decisions/README.md), um arquivo por decisão.

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-auth-github-oauth-sessao-d1.md) | Auth própria: GitHub OAuth em produção e sessão opaca em D1 | aceito |
| [0002](0002-custo-zero-free-tier.md) | Restrição de custo zero e uso dos free tiers | aceito |
| [0003](0003-pluggy-como-provider-open-finance.md) | Pluggy como provider de Open Finance | aceito |
| [0004](0004-origem-unica-service-binding.md) | Origem única via Pages Function e service binding | aceito |
| [0005](0005-dinheiro-em-centavos.md) | Dinheiro em centavos e datas ISO 8601 | aceito |

Pesquisa de suporte em [../research/](../research/): autenticação em Workers, provedores de Open
Finance e referência da API da Pluggy.
