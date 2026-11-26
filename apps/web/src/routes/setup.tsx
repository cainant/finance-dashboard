import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { ErrorState } from "@/components/domain/error-state";
import { FormField } from "@/components/domain/form-field";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { fieldErrorMessage } from "@/lib/form";
import { useSetupMutation } from "@/lib/mutations";
import { authProvidersQueryOptions } from "@/lib/queries";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

const setupSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome"),
    email: z.email("Informe um e-mail válido"),
    password: z.string().min(8, "Use ao menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type SetupValues = z.input<typeof setupSchema>;

const defaults: SetupValues = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function SetupPage() {
  const providersQuery = useQuery(authProvidersQueryOptions);
  const setupMutation = useSetupMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const providers = providersQuery.data;
  const passwordEnabled = providers?.password.enabled ?? false;
  const setupRequired = providers?.setupRequired ?? false;

  // Já existe usuário: o cadastro inicial não está mais disponível.
  useEffect(() => {
    if (providers && !providers.setupRequired) {
      window.location.replace("/login");
    }
  }, [providers]);

  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: setupSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);

      try {
        await setupMutation.mutateAsync({
          name: value.name.trim(),
          email: value.email,
          password: value.password,
        });
        window.location.assign("/");
      } catch (error) {
        setFormError(errorMessage(error));
      }
    },
  });

  return (
    <AuthLayout
      title="Criar conta"
      description="Configuração inicial do Lumen Finance. O primeiro usuário vira o dono do painel."
      footer={
        <p>
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        {providersQuery.isPending ? (
          <Skeleton className="h-72 w-full rounded-lg" />
        ) : providersQuery.isError ? (
          <ErrorState
            compact
            title="Não foi possível consultar o estado do setup"
            error={providersQuery.error}
            onRetry={() => void providersQuery.refetch()}
            isRetrying={providersQuery.isFetching}
          />
        ) : !setupRequired ? (
          <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-xs text-muted-foreground">
            Este painel já tem um usuário. Redirecionando para o login…
          </p>
        ) : !passwordEnabled ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
            O cadastro inicial exige senha, mas o login por senha está desabilitado neste ambiente.
            Defina <code className="font-mono">ENABLE_PASSWORD_LOGIN=true</code> em desenvolvimento
            ou crie o usuário pelo seed local.
          </p>
        ) : (
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
                <form.Field name="name" validators={{ onBlur: setupSchema.shape.name }}>
                  {(field) => (
                    <FormField
                      id="setup-name"
                      label="Nome"
                      error={fieldErrorMessage(field.state.meta.errors)}
                    >
                      <Input
                        id="setup-name"
                        name={field.name}
                        autoComplete="name"
                        placeholder="Como devemos chamar você?"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="email" validators={{ onBlur: setupSchema.shape.email }}>
                  {(field) => (
                    <FormField
                      id="setup-email"
                      label="E-mail"
                      error={fieldErrorMessage(field.state.meta.errors)}
                    >
                      <Input
                        id="setup-email"
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <form.Field name="password" validators={{ onBlur: setupSchema.shape.password }}>
                    {(field) => (
                      <FormField
                        id="setup-password"
                        label="Senha"
                        hint="Mínimo de 8 caracteres."
                        error={fieldErrorMessage(field.state.meta.errors)}
                      >
                        <Input
                          id="setup-password"
                          name={field.name}
                          type="password"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                        />
                      </FormField>
                    )}
                  </form.Field>

                  <form.Field name="confirmPassword">
                    {(field) => (
                      <FormField
                        id="setup-confirm"
                        label="Confirmar senha"
                        error={fieldErrorMessage(field.state.meta.errors)}
                      >
                        <Input
                          id="setup-confirm"
                          name={field.name}
                          type="password"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                        />
                      </FormField>
                    )}
                  </form.Field>
                </div>

                {formError ? (
                  <p role="alert" className="text-xs text-negative">
                    {formError}
                  </p>
                ) : null}

                <Button type="submit" className="w-full" disabled={setupMutation.isPending}>
                  {setupMutation.isPending ? "Criando conta…" : "Criar conta"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />A senha é habilitada
          apenas em desenvolvimento; em produção o acesso é por GitHub OAuth.
        </p>
      </div>
    </AuthLayout>
  );
}
