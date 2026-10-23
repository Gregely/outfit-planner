import { Suspense } from "react";
import { connection } from "next/server";
import { getCareDefaults, getSettings } from "@/server/services/settings";
import { aiStatus, aiConfig, REASON_TEXT } from "@/server/ai/client";
import { databaseFile } from "@/server/db";
import { photoDir } from "@/server/services/photos";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { AiSettings, BackupSettings, CareSettings, GeneralSettings, LocationSettings } from "@/components/settings";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="App" title="Settings" description="Location, integrations, care defaults and backups." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await connection();
  const s = getSettings();
  const ai = aiStatus();
  const cfg = aiConfig();
  return (
    <>
      <Section title="Location & weather">
        <LocationSettings location={s.location} />
      </Section>
      <Section title="General">
        <GeneralSettings settings={s} />
      </Section>
      <Section title="Claude stylist">
        <AiSettings enabled={s.aiEnabled} status={{ enabled: ai.enabled, reason: ai.reason ? REASON_TEXT[ai.reason] : null, configured: cfg.configured, model: cfg.model, effort: cfg.effort }} />
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
