/**
 * Pages Function: mantém a mesma origem em produção, encaminhando /api/* para
 * o Worker `finance-dashboard-api` via service binding (docs/architecture.md).
 *
 * Tipos mínimos locais para não misturar `@cloudflare/workers-types` com o
 * `lib.dom` do app React.
 */
interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

interface PagesEnv {
  API: ServiceBinding;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  next: () => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return env.API.fetch(new Request(request.url, init));
};
