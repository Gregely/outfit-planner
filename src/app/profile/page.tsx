import { Suspense } from "react";
import { connection } from "next/server";
import { getProfile, listFeedback, listRules } from "@/server/services/preferences";
import { listGarments } from "@/server/services/garments";
import { aiUi } from "@/server/ai/client";
import { today } from "@/server/services/settings";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { ProfileForm, RulesManager, FeedbackLog, GapAnalysis } from "@/components/profile";

export const metadata = { title: "Style profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader eyebrow="You" title="Style profile" description="Describe your style in your own words. Preferences guide suggestions; rules are always enforced." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

async function ProfileContent() {
  await connection();
  const garments = listGarments().map((g) => ({ id: g.id, name: g.name }));
  const names = Object.fromEntries(garments.map((g) => [g.id, g.name]));
  return (
    <>
      <Section title="Preferences">
        <ProfileForm profile={getProfile()} />
      </Section>
      <Section title="Rules" eyebrow="Always enforced">
        <RulesManager rules={listRules()} garments={garments} today={today()} />
      </Section>
      <Section title="Feedback you've given" eyebrow="Used to personalise suggestions">
        <FeedbackLog feedback={listFeedback(60)} names={names} today={today()} />
      </Section>
      <Section title="Wardrobe gaps" eyebrow="Optional">
        <GapAnalysis ai={aiUi("daily")} />
      </Section>
    </>
  );
}
