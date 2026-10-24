import type { Metadata } from "next";
import Link from "next/link";
import { requireConsent } from "../../../lib/gate";
import { summarize } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { pathWithQuery } from "../../../lib/profile";
import type { SearchParams } from "../../../lib/queries";
import { Board } from "../_components/board-view";
import { Topbar } from "../_components/topbar";

export const metadata: Metadata = { title: "Board · Muscle Memory" };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  await requireConsent(pathWithQuery("/board", params));
  const view = params.view === "list" ? "list" : "board";
  const { issues } = await getLibrary();
  return (
    <>
      <Topbar
        actions={
          <div className="segmented" role="group" aria-label="View">
            <Link className="btn" href="/board" aria-pressed={view === "board"}>
              Board
            </Link>
            <Link
              className="btn"
              href="/board?view=list"
              aria-pressed={view === "list"}
            >
              List
            </Link>
          </div>
        }
      >
        <span>Board</span>
      </Topbar>
      <main className="content">
        <Board issues={issues.map(summarize)} view={view} />
        <p className="hint board-hint">
          Set Backlog, Todo or In progress from an issue's Status menu (s). Done
          is set when you merge a pull request.
        </p>
      </main>
    </>
  );
}
