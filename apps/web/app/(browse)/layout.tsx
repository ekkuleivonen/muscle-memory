import { INCIDENT } from "../../lib/incident";
import { getLibrary } from "../../lib/load";
import { IncidentChat } from "./_components/incident-chat";
import { Keyboard } from "./_components/keyboard";
import { Sidebar } from "./_components/sidebar";

export default async function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { projects, issues, findIssue, revisionsOf } = await getLibrary();
  // The incident's chat follows the person across the tracker once they have started it.
  const incident = findIssue(INCIDENT.key);
  return (
    <div className="app">
      <Sidebar
        issueCount={issues.length}
        projects={projects.map(({ slug, title, key, hue, issues }) => ({
          slug,
          title,
          key,
          hue,
          count: issues.length,
        }))}
      />
      <div className="main">{children}</div>
      <Keyboard />
      {incident && (
        <IncidentChat
          revisionsJson={JSON.stringify(revisionsOf(incident.slug))}
          live={incident.revision}
        />
      )}
    </div>
  );
}
