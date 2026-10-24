import { requireOnboarding } from "../../lib/gate";
import { summarize } from "../../lib/library";
import { getLibrary } from "../../lib/load";
import { Dashboard } from "./_components/dashboard";
import { Topbar } from "./_components/topbar";

export default async function Home() {
  await requireOnboarding("/");
  const { issues } = await getLibrary();
  return (
    <>
      <Topbar>Home</Topbar>
      <main className="content">
        <Dashboard issues={issues.map(summarize)} />
      </main>
    </>
  );
}
