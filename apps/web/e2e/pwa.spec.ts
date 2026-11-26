import { expect, test } from "@playwright/test";

test("manifest e ícones são servidos com a CSP de produção", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/content security policy|refused to/i.test(msg.text())) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toBeTruthy();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const touchIconHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  expect(touchIconHref).toBeTruthy();

  // O Chromium só baixa o manifest sob demanda; Page.getAppManifest força o download pela página
  // (portanto sujeito a manifest-src/default-src) e devolve erro se a CSP bloquear.
  const cdp = await page.context().newCDPSession(page);
  const appManifest = await cdp.send("Page.getAppManifest");
  expect(appManifest.errors.map((e) => e.message)).toEqual([]);
  expect(appManifest.data).toBeTruthy();
  const manifest = JSON.parse(appManifest.data ?? "{}") as { icons: { src: string }[] };
  expect(manifest.icons.length).toBeGreaterThan(0);

  // Ícones carregados de dentro da página, sob img-src.
  for (const src of [touchIconHref ?? "", ...manifest.icons.map((icon) => icon.src)]) {
    const loaded = await page.evaluate(
      (url) =>
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth > 0);
          img.onerror = () => resolve(false);
          img.src = url;
        }),
      src,
    );
    expect(loaded, src).toBe(true);
  }

  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});
