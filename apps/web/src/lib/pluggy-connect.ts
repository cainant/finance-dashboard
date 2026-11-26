import type { ProviderId, ProviderInfo } from "@fd/contracts";

/** URL oficial do widget Pluggy Connect (versão fixa, carregada sob demanda). */
export const PLUGGY_CONNECT_SCRIPT_URL =
  "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js";

/**
 * Secrets exigidos pelo Worker para habilitar o provider Pluggy.
 * A UI mostra apenas os nomes — nunca os valores.
 */
export const PLUGGY_REQUIRED_SECRETS = [
  {
    name: "PLUGGY_CLIENT_ID",
    description: "clientId da aplicação criada no Dashboard da Pluggy.",
  },
  {
    name: "PLUGGY_CLIENT_SECRET",
    description: "clientSecret da aplicação (nunca é enviado ao navegador).",
  },
  {
    name: "PLUGGY_WEBHOOK_SECRET",
    description: "segredo do header x-webhook-secret usado para validar o webhook.",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Item id                                                                    */
/* -------------------------------------------------------------------------- */

/** Ids do Pluggy são UUIDs; a validação aceita também ids opacos do contrato. */
const ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const URL_PATH_SEGMENTS_WITHOUT_ID = new Set(["", "items", "item"]);

function stripWrapping(value: string): string {
  return value
    .trim()
    .replace(/^[\s"'`<>]+/, "")
    .replace(/[\s"'`<>]+$/, "")
    .trim();
}

function decodeSafely(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Normaliza um itemId colado pelo usuário. Aceita o id puro, com aspas/espaços
 * ao redor, uma URL do Dashboard da Pluggy ou um trecho `itemId=<uuid>`.
 * Devolve `null` quando o valor não parece um identificador utilizável.
 */
export function normalizePluggyItemId(raw: string): string | null {
  let candidate = stripWrapping(raw);

  if (!candidate) {
    return null;
  }

  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      const fromQuery = url.searchParams.get("itemId");
      const fromPath = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      candidate = fromQuery ?? fromPath;
    } catch {
      return null;
    }

    if (URL_PATH_SEGMENTS_WITHOUT_ID.has(candidate.toLowerCase())) {
      return null;
    }
  } else if (candidate.includes("itemId=")) {
    const [, after = ""] = candidate.split("itemId=", 2);
    candidate = after.split("&")[0] ?? "";
  }

  const decoded = decodeSafely(candidate);
  if (decoded === null) {
    return null;
  }

  const normalized = stripWrapping(decoded).replace(/\/+$/, "");
  return ITEM_ID_PATTERN.test(normalized) ? normalized : null;
}

/** Payload entregue pelo widget em `onSuccess` (varia entre versões do widget). */
export interface PluggyConnectSuccessPayload {
  item?: { id?: string | null } | null;
  itemId?: string | null;
}

/** Extrai e normaliza o itemId de um payload do widget. */
export function readPluggyItemId(
  payload: PluggyConnectSuccessPayload | null | undefined,
): string | null {
  const raw = payload?.item?.id ?? payload?.itemId ?? null;
  return typeof raw === "string" ? normalizePluggyItemId(raw) : null;
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

/** `true` quando a API informa Pluggy configurado e com suporte ao widget. */
export function isPluggyWidgetEnabled(
  providers:
    | ReadonlyArray<Pick<ProviderInfo, "id" | "configured" | "supportsConnectWidget">>
    | null
    | undefined,
): boolean {
  return (
    providers?.some(
      (provider) =>
        provider.id === "pluggy" && provider.configured && provider.supportsConnectWidget,
    ) ?? false
  );
}

/** Busca um provider pelo id mantendo o tipo concreto de item. */
export function findProvider<T extends Pick<ProviderInfo, "id">>(
  providers: readonly T[] | null | undefined,
  id: ProviderId,
): T | null {
  return providers?.find((provider) => provider.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Widget                                                                     */
/* -------------------------------------------------------------------------- */

export interface PluggyConnectOptions {
  connectToken: string;
  /** Restringe o widget a conectores específicos (MeuPluggy = 200). */
  connectorIds?: number[];
  /** Atualiza um item existente em vez de criar outro. */
  updateItem?: string;
  /** Só faz sentido com `updateItem`: força nova senha/MFA. */
  forceAskForCredentials?: boolean;
  includeSandbox?: boolean;
  onSuccess?: (payload: PluggyConnectSuccessPayload) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
  onOpen?: () => void;
}

export interface PluggyConnectWidget {
  init: () => void;
  destroy?: () => void;
}

export type PluggyConnectConstructor = new (options: PluggyConnectOptions) => PluggyConnectWidget;

/**
 * Mensagem em pt-BR para erros do widget (o payload do Pluggy pode vir em
 * inglês). Mantida fora do componente para não quebrar o Fast Refresh.
 */
export function widgetErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "").trim()
      : "";

  if (!message) {
    return "O Pluggy Connect encontrou um erro. Feche a janela e tente novamente.";
  }
  return `O Pluggy Connect encontrou um erro: ${message}`;
}

declare global {
  interface Window {
    PluggyConnect?: PluggyConnectConstructor;
  }
}

let loaderPromise: Promise<PluggyConnectConstructor> | null = null;

const SCRIPT_MARKER = "data-lumen-pluggy-connect";

/**
 * Carrega o script oficial do widget uma única vez (singleton) e resolve a
 * classe global `PluggyConnect`. Em caso de falha, remove o script para
 * permitir uma nova tentativa.
 */
export function loadPluggyConnect(doc?: Document): Promise<PluggyConnectConstructor> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("O widget Pluggy Connect só pode ser carregado no navegador."));
  }

  if (window.PluggyConnect) {
    return Promise.resolve(window.PluggyConnect);
  }

  if (loaderPromise) {
    return loaderPromise;
  }

  const targetDoc = doc ?? document;

  loaderPromise = new Promise<PluggyConnectConstructor>((resolve, reject) => {
    const script = targetDoc.createElement("script");

    const fail = (message: string) => {
      script.remove();
      loaderPromise = null;
      reject(new Error(message));
    };

    script.addEventListener(
      "load",
      () => {
        if (window.PluggyConnect) {
          resolve(window.PluggyConnect);
          return;
        }

        fail("O script do Pluggy Connect carregou, mas o widget não ficou disponível.");
      },
      { once: true },
    );

    script.addEventListener(
      "error",
      () => {
        fail(
          "Não foi possível carregar o widget Pluggy Connect. Verifique a conexão e tente novamente.",
        );
      },
      { once: true },
    );

    script.src = PLUGGY_CONNECT_SCRIPT_URL;
    script.async = true;
    script.setAttribute(SCRIPT_MARKER, "true");
    (targetDoc.head ?? targetDoc.body).appendChild(script);
  });

  return loaderPromise;
}
