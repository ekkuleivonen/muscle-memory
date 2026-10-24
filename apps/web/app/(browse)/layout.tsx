import { getLibrary } from "../../lib/load";
import { Keyboard } from "./_components/keyboard";
import { Sidebar } from "./_components/sidebar";

export default async function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { categories, issues } = await getLibrary();
  return (
    <div className="app">
      <Sidebar
        issueCount={issues.length}
        categories={categories.map(({ slug, title, key, hue, issues }) => ({
          slug,
          title,
          key,
          hue,
          count: issues.length,
        }))}
      />
      <div className="main">{children}</div>
      <Keyboard />
    </div>
  );
}
