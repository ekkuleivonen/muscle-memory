"use client";
import { useEffect, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";

/** Everything recorded in this browser, read once per visit; null while loading. */
export function useRecords(): WorkspaceRecord[] | null {
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
  }, []);
  return records;
}

/** Client-only "now", so server and first client render agree. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}
