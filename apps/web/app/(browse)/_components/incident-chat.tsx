"use client";
import { useEffect, useMemo, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Revision } from "../../../../../packages/content/model";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { attemptAt } from "../../../lib/attempts";
import { BOARD_CHANGE } from "../../../lib/board";
import { chatOf } from "../../../lib/chat";
import { INCIDENT, incidentState } from "../../../lib/incident";
import { TeamChat } from "./team-chat";

/** How often the chat looks for what happened elsewhere (another tab, the IDE). */
const REFRESH_MS = 5000;

async function readRecords(): Promise<WorkspaceRecord[]> {
  const store = await openPracticeStore();
  try {
    return await store.workspaceRecords();
  } finally {
    store.close();
  }
}

/**
 * The incident's team chat on every tracker page (dashboard, board, issues, pull requests),
 * once this browser has started the incident: the same lines, attempt and unread dot as in
 * the IDE and the report. It reads the records again when the board changes, the window
 * comes back, and every few seconds, so lines released elsewhere arrive here too.
 */
export function IncidentChat({
  revisionsJson,
  live,
}: {
  revisionsJson: string;
  live: string;
}) {
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  const [records, setRecords] = useState<WorkspaceRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      readRecords()
        .then((all) => alive && setRecords(all))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(BOARD_CHANGE, load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(BOARD_CHANGE, load);
      window.removeEventListener("focus", load);
    };
  }, []);
  const chat = useMemo(() => {
    if (!records) return null;
    const state = incidentState(records);
    if (!state.started) return null;
    // The revision the attempt plays, while it is published; otherwise the current one.
    const revision = revisions[state.revision ?? ""] ?? revisions[live];
    const lines = revision?.chat ?? [];
    if (!lines.length) return null;
    return {
      messages: chatOf(lines, records, INCIDENT.slug, (id) => revisions[id]),
      scope: `${INCIDENT.slug}@${attemptAt(records, INCIDENT.slug).start ?? "first"}`,
    };
  }, [records, revisions, live]);
  if (!chat) return null;
  return <TeamChat messages={chat.messages} scope={chat.scope} />;
}
