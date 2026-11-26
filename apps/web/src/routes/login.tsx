import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { ErrorState } from "@/components/domain/error-state";
import { FormField } from "@/components/domain/form-field";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { loginErrorMessage, safeRedirect } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import { fieldErrorMessage } from "@/lib/form";
import { useLoginMutation } from "@/lib/mutations";
import { authProvidersQueryOptions } from "@/lib/queries";

const loginSearchSchema = z.object({
  /** Rota interna para onde voltar depois do login. */
  redirect: z.string().max(2000).optional().catch(undefined),
  /** Código de erro devolvido pelo OAuth (`?error=`). */
  error: z.string().max(120).optional().catch(undefined),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: LoginPage,
});

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginPage() {
  const search = Route.useSearch();
  const providersQuery = useQuery(authProvidersQueryOptions);
  const loginMutation = useLoginMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const providers = providersQuery.data;
  const passwordEnabled = providers?.password.enabled ?? false;
  const githubEnabled = providers?.github.enabled ?? false;
  const setupRequired = providers?.setupRequired ?? false;
  const queryError = loginErrorMessage(search.error);

  // Sem nenhum usuário, o primeiro acesso é /setup.
  useEffect(() => {
    if (setupRequired) {
      window.location.replace("/setup");
    }
  }, [setupRequired]);

  const form = useForm({
    defaultValues: { email: "", password: "" } satisfies LoginValues,
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);

      try {
        await loginMutation.mutateAsync(value);
        window.location.assign(safeRedirect(search.redirect));
      } catch (error) {
        setFormError(errorMessage(error));
      }
    },
  });

  return (
    <AuthLayout
      title="Entrar"
      description="Acesse o painel para acompanhar contas, transações e faturas."
      footer={
        // O /setup só cria conta com senha; sem senha (produção) o primeiro
        // acesso pelo GitHub já cria o usuário.
        passwordEnabled ? (
          <p>
            Primeiro acesso?{" "}
            <Link
              to="/setup"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Criar conta
            </Link>
          </p>
        ) : (
          <p>O primeiro acesso pelo GitHub cria sua conta automaticamente.</p>
        )
      }
    >
      <div className="space-y-4">
        {queryError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-negative/25 bg-negative/5 px-3 py-2.5 text-xs leading-relaxed text-negative"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {queryError}
          </p>
        ) : null}

        {providersQuery.isPending ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-24 mx-auto" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : providersQuery.isError ? (
          <ErrorState
            compact
            title="Não foi possível consultar os métodos de login"
            error={providersQuery.error}
            onRetry={() => void providersQuery.refetch()}
            isRetrying={providersQuery.isFetching}
          />
        ) : (
          <>
            {githubEnabled ? (
              <Button asChild variant="outline" className="w-full">
                <a href={providers?.github.loginUrl ?? "/api/auth/github"}>
                  <GithubIcon />
                  Entrar com GitHub
                </a>
              </Button>
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />O login com GitHub
                não está configurado neste ambiente.
              </p>
            )}

            {passwordEnabled ? (
              <>
                {githubEnabled ? (
                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <span className="text-xs font-medium text-muted-foreground">ou com e-mail</span>
                    <Separator className="flex-1" />
                  </div>
                ) : null}

                <Card className="gap-0 py-0">
                  <CardContent className="p-4">
                    <form
                      noValidate
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void form.handleSubmit();
                      }}
                    >
                      <form.Field name="email" validators={{ onBlur: loginSchema.shape.email }}>
                        {(field) => (
                          <FormField
                            id="login-email"
                            label="E-mail"
                            error={fieldErrorMessage(field.state.meta.errors)}
                          >
                            <Input
                              id="login-email"
                              name={field.name}
                              type="email"
                              autoComplete="email"
                              placeholder="voce@exemplo.com"
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              onBlur={field.handleBlur}
                            />
                          </FormField>
                        )}
                      </form.Field>

                      <form.Field
                        name="password"
                        validators={{ onBlur: loginSchema.shape.password }}
                      >
                        {(field) => (
                          <FormField
                            id="login-password"
                            label="Senha"
                            error={fieldErrorMessage(field.state.meta.errors)}
                          >
                            <Input
                              id="login-password"
                              name={field.name}
                              type="password"
                              autoComplete="current-password"
                              placeholder="••••••••"
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              onBlur={field.handleBlur}
                            />
                          </FormField>
                        )}
                      </form.Field>

                      {formError ? (
                        <p role="alert" className="text-xs text-negative">
                          {formError}
                        </p>
                      ) : null}

                      <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                        {loginMutation.isPending ? "Entrando…" : "Entrar"}
                        <ArrowRight aria-hidden="true" />
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  Login por senha habilitado apenas em desenvolvimento/teste (PBKDF2 não cabe no
                  orçamento de CPU do plano Free). Em produção, use GitHub OAuth.
                </p>
              </>
            ) : null}

            {!githubEnabled && !passwordEnabled ? (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                Nenhum método de login está habilitado. Configure GitHub OAuth ou defina
                <code className="mx-1 font-mono">ENABLE_PASSWORD_LOGIN=true</code>
                em desenvolvimento.
              </p>
            ) : null}
          </>
        )}
      </div>
    </AuthLayout>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M12 0.5C5.65 0.5 0.5 5.65 0.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.58.23 2.75.12 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35 0.5 12 0.5Z" />
    </svg>
  );
}
