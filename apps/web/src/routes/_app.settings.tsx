import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/domain/page-header";
import { AccountSection } from "@/components/settings/account-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";
import { PreferencesSection } from "@/components/settings/preferences-section";
import { ProvidersSection } from "@/components/settings/providers-section";

export const Route = createFileRoute("/_app/settings")({
  staticData: { title: "Configurações" },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Aparência, preferências e os dados da sua conta."
      />

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <AppearanceSection />
        <PreferencesSection />
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <AccountSection />
        <ProvidersSection />
      </div>

      <DangerZoneSection />
    </div>
  );
}
