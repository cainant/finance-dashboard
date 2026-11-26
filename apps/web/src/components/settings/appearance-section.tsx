import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme/theme-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUpdateSettingsMutation } from "@/lib/mutations";
import { settingsQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { SettingsCard, SettingsRow } from "./settings-section";
import { settingsSummary } from "./settings-view";

/**
 * Tema local (localStorage) + persistência best-effort em `PUT /api/settings`.
 * Se a API estiver indisponível, a troca local continua funcionando.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const settingsQuery = useQuery(settingsQueryOptions);
  const updateMutation = useUpdateSettingsMutation();

  const remoteSettings = settingsQuery.data?.data;
  const remoteTheme = remoteSettings?.theme;
  const remoteDiffers = Boolean(remoteTheme && remoteTheme !== "system" && remoteTheme !== theme);
  const isSaving = updateMutation.isPending;
  // Se o GET de settings já falhou, sabemos que a API não está disponível:
  // não vale disparar PUTs que só gerariam toasts de erro.
  const canPersistSettings = !settingsQuery.isError;

  function selectTheme(mode: Theme) {
    if (mode === theme && remoteTheme === mode) {
      return;
    }

    setTheme(mode);
    if (canPersistSettings) {
      updateMutation.mutate({ theme: mode });
    }
  }

  return (
    <SettingsCard
      title="Aparência"
      description="Escuro é o padrão. A troca vale na hora, em todo o painel."
    >
      <SettingsRow
        label="Tema"
        description="Vale neste navegador e fica salvo na sua conta."
        control={
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(value) => {
              if (value) {
                selectTheme(value as Theme);
              }
            }}
            aria-label="Tema"
          >
            <ToggleGroupItem value="dark" disabled={isSaving}>
              Escuro
            </ToggleGroupItem>
            <ToggleGroupItem value="light" disabled={isSaving}>
              Claro
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="space-y-2 px-4 py-3">
        {settingsQuery.isPending ? (
          <Skeleton className="h-3 w-64" />
        ) : settingsQuery.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="size-3.5 text-warning" />
            <span>
              Não foi possível carregar suas preferências — a troca de tema continua valendo aqui.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5 text-xs"
              onClick={() => void settingsQuery.refetch()}
              disabled={settingsQuery.isFetching}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(settingsQuery.isFetching && "animate-spin")}
              />
              Tentar novamente
            </Button>
          </div>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            {remoteSettings ? (
              <>
                Na sua conta:{" "}
                <span className="font-medium text-foreground">
                  {settingsSummary(remoteSettings)}
                </span>
                {remoteDiffers ? " · este navegador está em outro tema." : null}
              </>
            ) : (
              "Não foi possível ler as preferências salvas na sua conta."
            )}
          </p>
        )}

        {isSaving ? (
          <p className="flex items-center gap-2 text-xs text-info" role="status">
            <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
            Salvando na conta…
          </p>
        ) : null}

        {updateMutation.isError ? (
          <p className="text-xs text-warning" role="status">
            Não foi possível salvar na sua conta. O tema escolhido continua valendo neste navegador.
          </p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
