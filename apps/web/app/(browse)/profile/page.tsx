import { requireConsent } from "../../../lib/gate";
import { getLibrary } from "../../../lib/load";
import { ProfileEvidence } from "../_components/profile-evidence";
import { Topbar } from "../_components/topbar";

export const metadata = { title: "Profile · Muscle Memory" };
export default async function ProfilePage() {
  await requireConsent("/profile");
  const library = await getLibrary();
  return (
    <>
      <Topbar>Profile</Topbar>
      <main className="content">
        <h1>Your practice</h1>
        <p className="dim">
          Completed challenges and the checks recorded for them.
        </p>
        <ProfileEvidence
          issues={library.allIssues.map((i) => ({
            key: i.key,
            title: i.title,
          }))}
        />
        <p className="hint">
          Comparisons with other developers and models are not available yet.
        </p>
      </main>
    </>
  );
}
