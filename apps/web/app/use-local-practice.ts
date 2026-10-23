"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  openPracticeStore,
  encodePendingExport,
  type PracticeStore,
} from "../../../packages/browser/practice-store";
import type { AttemptEvent } from "../../../packages/domain/events";

/** Device-local adapter boundary; the practice UI never posts event records to a server. */
export function useLocalPractice(enabled: boolean) {
  const connection = useRef<Promise<PracticeStore> | null>(null);
  const [saved, setSaved] = useState<AttemptEvent[]>([]);
  const [error, setError] = useState("");
  const store = useCallback(() => {
    if (!connection.current) {
      connection.current = openPracticeStore().catch((cause) => {
        connection.current = null;
        throw cause;
      });
    }
    return connection.current;
  }, []);
  const refresh = useCallback(async () => {
    setSaved(await (await store()).pending());
    setError("");
  }, [store]);
  useEffect(() => {
    if (enabled)
      refresh().catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Device-local storage is unavailable.",
        ),
      );
    // Opening storage is an explicit opt-in for this session.
  }, [enabled, refresh]);
  async function save(event: AttemptEvent) {
    await (await store()).append(event);
    await refresh();
  }
  async function clear() {
    await (await store()).clear();
    setSaved([]);
    setError("");
  }
  async function download() {
    const events = await (await store()).pending();
    const url = URL.createObjectURL(
      new Blob([encodePendingExport(events)], { type: "application/x-ndjson" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "muscle-memory-local-events.jsonl";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // Browser downloads provide no durable-write receipt. Keep events retryable.
  }
  return {
    saved,
    error,
    save,
    clear,
    download,
    participantId: async () => (await store()).participantId(),
  };
}
