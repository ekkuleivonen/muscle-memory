"use client";
import { useEffect } from "react";
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../../../packages/browser/practice-store";
import { Uploader } from "../../../../../packages/browser/uploader";
import { readProfile } from "../../../lib/account";
import { INGEST_URL } from "../../../lib/ingest";
import { acceptsCurrent } from "../../../lib/legal";

let uploader: Uploader | null = null;

/**
 * Uploads recorded practice in the background on every page, under the current Terms only,
 * and tries once more as the page is hidden. Off unless an ingest endpoint is configured.
 */
export function Uploads() {
  useEffect(() => {
    if (!INGEST_URL) return;
    let store: Promise<PracticeStore> | null = null;
    uploader ??= new Uploader({
      endpoint: INGEST_URL,
      store: () => (store ??= openPracticeStore()),
      allowed: () => {
        const accepted = readProfile()?.accepted;
        return Boolean(accepted && acceptsCurrent(accepted));
      },
    });
    const current = uploader;
    current.start();
    const hidden = () => {
      if (document.visibilityState === "hidden") void current.flush(true);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      current.stop();
    };
  }, []);
  return null;
}
