import { Suspense } from "react";
import { connection } from "next/server";
import { getCareDefaults, getSettings } from "@/server/services/settings";
import { getAiSettingsView } from "@/server/services/ai-settings";
import { databaseFile } from "@/server/db";
import { photoDir } from "@/server/services/photos";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { BackupSettings, CareSettings, GeneralSettings, LocationSettings } from "@/components/settings";
import { AiProvidersSettings } from "@/components/ai-providers";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="App" title="Settings" description="Location, AI providers, care defaults and backups." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await connection();
  const s = getSettings();
  return (
    <>
      <Section title="Location & weather">
        <LocationSettings location={s.location} />
      </Section>
      <Section title="General">
        <GeneralSettings settings={s} />
      </Section>
      <Section title="AI providers" eyebrow="Optional">
        <AiProvidersSettings view={getAiSettingsView(s.aiEnabled)} />
      </Section>
      <Section title="Care defaults" eyebrow="Wash-after-wear by category">
        <CareSettings care={getCareDefaults()} />
      </Section>
      <Section title="Backup & data">
        <BackupSettings dbPath={databaseFile()} photoPath={photoDir()} />
      </Section>
    </>
  );
}
