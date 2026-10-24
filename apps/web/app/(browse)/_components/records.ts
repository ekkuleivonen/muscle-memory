"use client";
import { useEffect, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";

/**
 * Everything recorded in this browser, read once per visit, and again whenever `version`
 * changes (after this page records something); null while first loading.
 */
export function useRecords(version = 0): WorkspaceRecord[] | null {
  const [records, setRecords] = useState<WorkspaceRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    openPracticeStore()
      .then(async (store) => {
        try {
          const all = await store.workspaceRecords();
          if (live) setRecords(all);
        } finally {
          store.close();
        }
      })
      .catch(() => live && setRecords([]));
    return () => {
      live = false;
    };
  }, [version]);
  return records;
}

/** Client-only "now", so server and first client render agree. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}
