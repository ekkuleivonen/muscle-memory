import { requireConsent } from "../../../lib/gate";
import { summarize } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { Ask } from "../_components/ask";
import { Dashboard } from "../_components/dashboard";
import { Topbar } from "../_components/topbar";

/** The player's own page: their week, their board, what to pick up next. */
export default async function DashboardPage() {
  await requireConsent("/dashboard");
  const { issues } = await getLibrary();
  return (
    <>
      <Topbar>Dashboard</Topbar>
      <main className="content">
        <Ask className="dashboard-ask" ids={["experience", "aiUse", "languages", "goal"]} from="dashboard" />
        <Dashboard issues={issues.map(summarize)} />
      </main>
    </>
  );
}
