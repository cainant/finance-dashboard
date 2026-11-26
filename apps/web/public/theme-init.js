/*
 * Bootstrap executado antes do bundle (script clássico e síncrono, referenciado
 * por `src` para conviver com `script-src 'self'`):
 * 1. desativa o JIT do Zod v4 — sob CSP estrita, o probe `Function("")` gera
 *    `securitypolicyviolation` mesmo com o erro capturado (o Zod expõe o modo
 *    `jitless` justamente para esse cenário);
 * 2. aplica o tema antes do primeiro paint para evitar flash (dark é o padrão).
 * Mantenha a chave do tema em sincronia com
 * src/components/theme/theme-context.ts.
 */
(function () {
  try {
    if (!globalThis.__zod_globalConfig) {
      globalThis.__zod_globalConfig = { jitless: true };
    }
  } catch {
    /* Sem globalThis: segue com o padrão do Zod. */
  }

  try {
    var stored = window.localStorage.getItem("lumen:theme");
    var theme = stored === "light" || stored === "dark" ? stored : "dark";
    var root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute("content", theme);
    var chrome = document.querySelector('meta[name="theme-color"]');
    if (chrome) chrome.setAttribute("content", theme === "dark" ? "#030303" : "#ffffff");
  } catch {
    /* localStorage bloqueado: segue com o dark do HTML. */
  }
})();
