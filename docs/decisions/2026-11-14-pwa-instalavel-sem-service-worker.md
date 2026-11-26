# PWA instalável sem service worker

- **Data:** 2026-11-14
- **PR:** #72

## Contexto

O Lumen é usado no celular, mas abria como aba do navegador (barra de endereço, sem ícone na tela
inicial). A etapa 2 da experiência mobile "cara de app" é torná-lo instalável. Ainda não há manifest,
ícones PNG nem metas da Apple; o favicon é um SVG inline (quadrado azul `#0e6ee6` com "L" branco).

## Decisão

O app é instalável por **manifest + ícones + metas**, **sem service worker**.

- `apps/web/public/manifest.webmanifest`: `name` "Lumen Finance", `short_name` "Lumen", `lang` pt-BR,
  `display: standalone`, `start_url`/`scope` `/`, `background_color` e `theme_color` `#030303`
  (o tema escuro é o padrão; o manifest não varia por tema. No Android e no Chrome, a barra de status
  segue o `theme-color` da `<meta>`, que o `theme-init.js` já alterna por tema; no app instalado no
  iOS quem manda é o `status-bar-style`, descrito abaixo).
- Ícones em `apps/web/public/icons/` (192, 512 "any", 512 `maskable`, `apple-touch-icon` 180 opaco),
  gerados por `pnpm --filter @fd/web icons` (`scripts/generate-pwa-icons.mjs`, Chromium do Playwright)
  e commitados. O maskable é quadrado sem cantos; o "L" ocupa 14/32 do lado, dentro do círculo de
  zona segura (80%).
- `index.html`: `rel="manifest"`, `apple-touch-icon`, metas `mobile-web-app-capable`,
  `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=default`,
  `apple-mobile-web-app-title`, e `viewport-fit=cover`.
- **Safe areas:** este PR só adiciona `viewport-fit=cover`; o tratamento de `env(safe-area-inset-*)`
  chega pelo PR do shell mobile (`feat/mobile-shell`). Sem ele, o conteúdo ficaria sob o notch e a
  barra home no modo cover, então **este PR só deve ser mergeado depois do PR do shell**.
- **Barra de status do iOS = `default`, não `black-translucent`:** `black-translucent` deixa o texto da
  barra sempre branco, que some sobre o fundo branco do tema claro, e o `theme-color` por tema não
  altera isso no modo standalone. Com `default` o iOS escolhe a cor do texto e mantém a barra legível
  nos dois temas, ao custo de a barra ocupar uma faixa própria em vez de sobrepor o conteúdo.
- CSP inalterada: manifest e ícones são `'self'` (`manifest-src` e `img-src` herdam/permitem `'self'`),
  e o plugin `lumen:security-headers` continua replicando `_headers` no dev/preview. O e2e
  `pwa.spec.ts` confere que são servidos com a CSP ativa.
- **Sem service worker, sem `vite-plugin-pwa`.** Um worker que faz cache offline guardaria respostas
  de `/api/*` (saldos, transações) no aparelho, em cache fora do controle da sessão (logout não o
  limparia), o que exige uma decisão de privacidade própria. Também não há fallback offline: sem
  rede, o app instalado mostra o erro do navegador. Chrome/Edge atuais não exigem service worker
  para oferecer a instalação; o iOS nunca exigiu.

## Login em modo standalone (análise, não testada em aparelho)

Fluxo atual (`apps/api/src/auth/routes.ts`): `/login` → navegação para `/api/auth/github` (mesma
origem, dentro do `scope`; grava o cookie `fd_oauth_state`, `SameSite=Lax`) → redirect para
`github.com` (fora do escopo) → redirect para `/api/auth/github/callback` (grava o cookie de sessão,
`HttpOnly; SameSite=Lax; Secure`) → redirect para `/`. Tudo são navegações top-level GET, então
`SameSite=Lax` não bloqueia nada; não há `window.open`, popup nem `postMessage`. Nenhum problema
concreto foi encontrado no código, então **não houve mudança em autenticação**.

O risco é de plataforma: ao sair do `scope`, o app standalone pode abrir o GitHub num navegador
embutido, e o cookie de sessão precisa acabar no armazenamento do app instalado.

- **Android (Chrome/WebAPK):** o WebAPK compartilha cookies com o Chrome; o GitHub abre numa Custom
  Tab e, ao voltar para a URL do `scope`, o Chrome devolve ao app. Risco baixo; o pior caso é ficar
  na Custom Tab já autenticado.
- **iOS (Safari, "Adicionar à Tela de Início"):** o app standalone tem armazenamento separado do
  Safari. Desde o iOS 16.4 a navegação fora do escopo abre um navegador embutido com botão "OK".
  Se o cookie gravado ali não chegar ao contêiner do app, o usuário volta ao `/login` deslogado.
  Risco médio e o ponto que precisa de teste real.

**Teste manual do dono (produção, ~5 min):**

1. iOS: Safari → abrir o Lumen → Compartilhar → "Adicionar à Tela de Início". Abrir pelo ícone
   (deve abrir sem barra do Safari, com o nome "Lumen").
2. Se estiver logado, sair (menu do usuário → Sair). Tocar em entrar com GitHub, autorizar.
   Esperado: volta ao painel **dentro do app**, autenticado. Fechar o app por completo e reabrir:
   continua logado.
3. Se voltar ao `/login` ou ficar preso no navegador embutido: anotar o passo e a versão do iOS.
4. Com o app instalado no iOS, conferir a legibilidade da barra de status (hora, bateria) nos temas
   claro e escuro.
5. Safari em paisagem (iPhone girado): o conteúdo não pode ficar sob o notch nem sob as bordas.
6. Android: Chrome → menu → "Instalar app". Repetir o passo 2. Confirmar também que o ícone
   maskable não corta o "L" no launcher.

## Alternativas descartadas

- **`vite-plugin-pwa` / service worker agora:** ver acima; fica para uma decisão de privacidade
  (o que pode ser cacheado, expiração e limpeza no logout).
- **Ícone único com `purpose: "any maskable"`:** o ícone "any" tem cantos arredondados transparentes,
  que a máscara do Android encolheria ou cortaria.
- **Manifest gerado no build:** não há valor dinâmico; um arquivo estático em `public/` é mais simples.

## Consequências

- Sem deploy especial: `public/` vai no mesmo `pnpm deploy:prod`. O Pages serve o `.webmanifest`;
  depois do deploy, abra `/manifest.webmanifest` e confira que responde JSON.
- Ficam para depois: service worker e cache offline (decisão de privacidade), tela offline,
  `theme_color` por tema no manifest, `shortcuts`, screenshots para o prompt de instalação rico e
  eventual troca de código de uso único no login se o teste no iOS falhar.
