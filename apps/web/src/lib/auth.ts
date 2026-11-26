import type { User } from "@fd/contracts";
import { isRedirect, redirect } from "@tanstack/react-router";

import { ApiError } from "./api";
import { meQueryOptions } from "./queries";
import type { RouterContext } from "./router-context";

export interface SessionContext {
  user: User;
}

/**
 * Garante uma sessão válida antes de renderizar o shell autenticado.
 * 401 → /login com `?redirect=` da rota atual; API indisponível propaga o erro
 * para o error boundary (sem loop de login).
 */
export async function requireSession({
  context,
  location,
}: {
  context: RouterContext;
  location: { href: string };
}): Promise<SessionContext> {
  try {
    const session = await context.queryClient.ensureQueryData(meQueryOptions);
    return { user: session.user };
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    if (ApiError.from(error).isUnauthorized) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
        replace: true,
      });
    }

    throw error;
  }
}

/**
 * Só aceita caminhos internos como destino pós-login. Evita open redirect
 * (`//evil.com`, `https://…`).
 */
export function safeRedirect(value: string | undefined, fallback = "/"): string {
  if (!value) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  return value;
}

/** Iniciais para o fallback do avatar ("Cainan Silva" → "CS"). */
export function userInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** Mensagens amigáveis para os erros devolvidos pelo OAuth (`?error=`). */
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  github_not_allowed: "Sua conta do GitHub não está na lista de acesso deste painel.",
  github_not_configured: "O login com GitHub não está configurado neste ambiente.",
  github_denied: "A autorização foi cancelada no GitHub.",
  github_state: "A sessão de autorização expirou. Tente entrar novamente.",
  github_error: "O GitHub não concluiu a autorização. Tente novamente.",
  oauth_failed: "O GitHub não concluiu a autorização. Tente novamente.",
  state_mismatch: "A sessão de autorização expirou. Tente entrar novamente.",
  access_denied: "A autorização foi cancelada no GitHub.",
  provider_unavailable: "O provedor de login está indisponível no momento.",
};

export function loginErrorMessage(code: string | undefined): string | null {
  if (!code) {
    return null;
  }

  return LOGIN_ERROR_MESSAGES[code] ?? "Não foi possível concluir o login. Tente novamente.";
}
