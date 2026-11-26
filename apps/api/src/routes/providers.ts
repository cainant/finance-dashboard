/**
 * `GET /api/providers` e `POST /api/providers/pluggy/connect-token`.
 *
 * O clientSecret nunca sai do Worker: o widget recebe apenas o accessToken de
 * curta duração (TTL 30 min) gerado pelo Pluggy. O token é opcionalmente
 * vinculado a um item existente (`itemId`) para reconectar/atualizar.
 *
 * O webhook é global (`POST /webhooks` com header secreto), não por item: o
 * connect token NÃO recebe `webhookUrl`, para não duplicar notificações.
 */
import { Hono } from "hono";
import {
  connectTokenBody,
  type ConnectTokenResponse,
  type ProviderInfo,
  type ProvidersResponse,
} from "@fd/contracts";
import { connections } from "@fd/database/schema";
import type { ProviderDescriptor } from "@fd/financial-providers";
import { and, eq } from "drizzle-orm";

import { currentUser } from "../auth/middleware";
import type { AppEnv } from "../env";
import { notFound, providerError, validationError } from "../http/errors";

export const providerRoutes = new Hono<AppEnv>();

const DESCRIPTIONS: Record<string, string> = {
  demo: "Dados fictícios determinísticos (3 instituições, ~12 meses) para explorar o app.",
  pluggy: "Open Finance via MeuPluggy: leitura dos seus próprios bancos, com dados reais.",
};

providerRoutes.get("/", (c) => {
  const body: ProvidersResponse = {
    data: c.get("providers").list().map(toProviderInfo),
  };
  return c.json(body);
});

providerRoutes.post("/pluggy/connect-token", async (c) => {
  const user = currentUser(c);
  const pluggy = c.get("providers").pluggy;
  if (!pluggy) throw providerError("Pluggy não está configurado neste ambiente.");

  // O corpo é opcional: `{}` e requisições sem body são aceitos.
  const raw = await c.req.json().catch(() => ({}));
  const parsed = connectTokenBody.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const { itemId } = parsed.data;

  // O itemId é global no Pluggy. Só permitimos reconectar um item que já
  // pertence a uma conexão deste usuário (evita IDOR entre usuários).
  if (itemId) {
    const [existing] = await c
      .get("db")
      .select({ id: connections.id })
      .from(connections)
      .where(
        and(
          eq(connections.userId, user.id),
          eq(connections.provider, "pluggy"),
          eq(connections.externalId, itemId),
        ),
      )
      .limit(1);
    if (!existing) throw notFound("Conexão Pluggy não encontrada");
  }

  // Falha fechada: sem o conector MeuPluggy não há como restringir o widget.
  let connector;
  try {
    connector = await pluggy.resolveMeuPluggyConnector();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "pluggy_connector_lookup_failed",
        requestId: c.get("requestId"),
        errorName: error instanceof Error ? error.name : typeof error,
      }),
    );
    throw providerError("Não foi possível resolver o conector MeuPluggy. Tente novamente.");
  }
  if (!connector) {
    throw providerError(
      "O conector MeuPluggy não está disponível para esta aplicação. Habilite-o no Dashboard da Pluggy.",
    );
  }

  const accessToken = await pluggy.createConnectToken({
    clientUserId: user.id,
    ...(itemId ? { itemId } : {}),
  });

  const body: ConnectTokenResponse = { accessToken, connectorId: connector.id };
  return c.json(body);
});

function toProviderInfo(descriptor: ProviderDescriptor): ProviderInfo {
  return {
    id: descriptor.id,
    name: descriptor.name,
    configured: descriptor.configured,
    description: DESCRIPTIONS[descriptor.id] ?? null,
    supportsConnectWidget: descriptor.id === "pluggy",
  };
}
