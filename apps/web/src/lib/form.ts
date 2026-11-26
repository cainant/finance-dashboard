/** Extrai a primeira mensagem legível de erros de validação do TanStack Form. */
export function fieldErrorMessage(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string" && error.length > 0) {
      return error;
    }

    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }
  }

  return undefined;
}
