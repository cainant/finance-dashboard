import type { KeyValueCache } from "./cache";
import { DEMO_CAPABILITIES, DemoProvider, type DemoProviderOptions } from "./demo";
import { ProviderError } from "./errors";
import { PLUGGY_CAPABILITIES, PluggyProvider, type PluggyProviderOptions } from "./pluggy";
import {
  PROVIDER_IDS,
  type FinancialProvider,
  type ProviderCapabilities,
  type ProviderId,
} from "./types";

/**
 * Config no formato de `Env` do Worker (vars/secrets + KV opcional).
 * As credenciais do Pluggy nunca vêm de código versionado.
 */
export interface ProviderRegistryEnv {
  PLUGGY_CLIENT_ID?: string;
  PLUGGY_CLIENT_SECRET?: string;
  PLUGGY_BASE_URL?: string;
  ENABLE_DEMO_PROVIDER?: string | boolean;
  CACHE?: KeyValueCache;
}

export type PluggyRegistryOptions = Omit<PluggyProviderOptions, "clientId" | "clientSecret">;

export interface ProviderRegistryOptions {
  /** Injetável em testes; default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Adapter de KV; usado só como cache de leitura (apiKey). */
  cache?: KeyValueCache;
  /** Relógio compartilhado por demo/Pluggy (injetável em testes). */
  now?: () => Date;
  pluggy?: PluggyRegistryOptions;
  demo?: DemoProviderOptions;
}

export interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  /** `true` quando as credenciais/flag necessárias existem e o provider foi registrado. */
  configured: boolean;
  capabilities: ProviderCapabilities;
}

export interface ProviderRegistry {
  get(id: ProviderId): FinancialProvider | undefined;
  /** Igual a `get`, mas lança `ProviderError` `not_found` quando não configurado. */
  require(id: ProviderId): FinancialProvider;
  /** Todos os providers conhecidos, com o estado de configuração para `/api/providers`. */
  list(): ProviderDescriptor[];
  readonly demo?: DemoProvider;
  readonly pluggy?: PluggyProvider;
}

const PROVIDER_NAMES: Readonly<Record<ProviderId, string>> = {
  demo: "Demonstração",
  pluggy: "Pluggy",
};

const STATIC_CAPABILITIES: Readonly<Record<ProviderId, ProviderCapabilities>> = {
  demo: DEMO_CAPABILITIES,
  pluggy: PLUGGY_CAPABILITIES,
};

/**
 * Monta o registry a partir do ambiente:
 * - Pluggy só é registrado com `PLUGGY_CLIENT_ID` **e** `PLUGGY_CLIENT_SECRET`;
 * - Demo é registrado somente se `ENABLE_DEMO_PROVIDER` for verdadeiro;
 * - `list()` continua mostrando providers não configurados com `configured: false`.
 */
export function createProviderRegistry(
  env: ProviderRegistryEnv,
  options: ProviderRegistryOptions = {},
): ProviderRegistry {
  const cache = options.cache ?? env.CACHE;
  const clock = options.now;
  const clientId = env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = env.PLUGGY_CLIENT_SECRET?.trim();

  let pluggy: PluggyProvider | undefined;
  if (clientId && clientSecret) {
    const pluggyOptions: PluggyProviderOptions = {
      ...options.pluggy,
      clientId,
      clientSecret,
    };
    if (pluggyOptions.baseUrl === undefined && env.PLUGGY_BASE_URL?.trim()) {
      pluggyOptions.baseUrl = env.PLUGGY_BASE_URL.trim();
    }
    if (pluggyOptions.cache === undefined && cache) pluggyOptions.cache = cache;
    if (pluggyOptions.fetch === undefined && options.fetch) pluggyOptions.fetch = options.fetch;
    if (pluggyOptions.now === undefined && clock) {
      pluggyOptions.now = () => clock().getTime();
    }
    pluggy = new PluggyProvider(pluggyOptions);
  }

  let demo: DemoProvider | undefined;
  if (parseBoolean(env.ENABLE_DEMO_PROVIDER)) {
    const demoNow = options.demo?.now ?? clock ?? (() => new Date());
    demo = new DemoProvider({ ...options.demo, now: demoNow });
  }

  const providers = new Map<ProviderId, FinancialProvider>();
  if (demo) providers.set("demo", demo);
  if (pluggy) providers.set("pluggy", pluggy);

  return {
    get(id) {
      return providers.get(id);
    },
    require(id) {
      const provider = providers.get(id);
      if (!provider) {
        throw new ProviderError("not_found", `Provider ${id} não configurado.`, {
          retryable: false,
        });
      }
      return provider;
    },
    list() {
      // O demo só aparece quando está habilitado. Isso mantém a UI de produção
      // sem qualquer CTA/selo de demonstração: `/api/providers` é a fonte da
      // verdade para a visibilidade do modo demo.
      return PROVIDER_IDS.filter((id) => id !== "demo" || demo !== undefined).map((id) => {
        const provider = providers.get(id);
        return {
          id,
          name: PROVIDER_NAMES[id],
          configured: provider !== undefined,
          capabilities: provider?.capabilities ?? STATIC_CAPABILITIES[id],
        };
      });
    },
    get demo() {
      return demo;
    },
    get pluggy() {
      return pluggy;
    },
  };
}

function parseBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}
