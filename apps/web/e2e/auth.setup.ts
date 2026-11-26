import { expect, test as setup } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

/**
 * Autentica uma vez com o usuário demo do seed e salva o cookie de sessão.
 * Os testes de UI reaproveitam esse estado via `storageState`.
 */
setup("autentica com o usuário demo", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: { email: "demo@finance.local", password: "demo1234" },
    headers: { "X-Requested-With": "fetch" },
  });

  expect(
    response.ok(),
    `login demo falhou com HTTP ${response.status()}: ${await response.text()}`,
  ).toBeTruthy();

  await request.storageState({ path: authFile });
});
