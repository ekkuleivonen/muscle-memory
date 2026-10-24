import type { Metadata } from "next";
import { requireOnboarding } from "../../../lib/gate";
import { SettingsForm } from "../_components/settings-form";
import { Topbar } from "../_components/topbar";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

export default async function SettingsPage() {
  await requireOnboarding("/settings");
  return (
    <>
      <Topbar>
        <span>Settings</span>
      </Topbar>
      <main className="content settings">
        <h1>Settings</h1>
        <SettingsForm />
      </main>
    </>
  );
}
