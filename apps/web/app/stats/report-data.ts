"use client";
/**
 * Everything the report reads, assembled automatically on an ordinary visit (ENG-374):
 * this device's evidence first, then the owner's uploaded summaries and model receipts, each
 * arriving independently. Stealth reads nothing. Reset, deletion, import, logout and privacy
 * changes clear what is shown synchronously and discard every pending response.
 */
import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { privateView } from "../../../../packages/developer-profile/private-view";
import {
  historyWindow,
  type UploadedHistory,
} from "../../../../packages/developer-profile/uploaded-history";
import { localHistory } from "../../../../packages/developer-profile/history";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import type { ReceiptRead } from "../../../../packages/model-runs/read-receipts";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import { listenPrivateBoundary } from "../../lib/private-boundary";
import { ACCOUNT_CHANGE, readProfile } from "../../lib/account";
import { acceptsCurrent } from "../../lib/legal";
import { PROFILE_KEY, type StoredProfile } from "../../lib/profile";
import { PROGRESS_CHANGE, PROGRESS_KEY, readProgress, type Progress } from "../../lib/progress";
import type { ReceiptState } from "../../lib/report";
import { COHORTS_ENABLED, type CohortRead } from "../../../../packages/statistics/cohort";

export type Privacy = "reading" | "ok" | "stealth" | "signed-out" | "error";
export interface DeviceEvidence {
  attempts: AttemptSummary[];
  progress: Progress;
  profile: StoredProfile;
  at: string;
}
export type HistoryStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; value: UploadedHistory; notice?: string }
  | { state: "no-uploads" | "limited" | "unavailable" | "unauthorized" | "held"; message: string };

/** After the report closes, uploaded summaries stay in page memory at most this long, so returning to /stats doesn't re-query. */
const HISTORY_TTL_MS = 5 * 60 * 1000;
/** The report holds at most this many uploaded attempt revisions, as the ENG-340 reader promised. */
export const HISTORY_MAX_ATTEMPTS = 100;
/** The private reader's widest window: the past year of uploaded activity. */
export const HISTORY_DAYS = 366;
let cache: { participant: string; value: UploadedHistory; at: number } | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
const dropCache = () => {
  cache = null;
  clearTimeout(expiry);
};
const keep = (participant: string, value: UploadedHistory) => {
  clearTimeout(expiry);
  cache = { participant, value, at: Date.now() };
  expiry = setTimeout(dropCache, HISTORY_TTL_MS);
};
/**
 * Boundaries in progress anywhere in this tab, counted so a nested one (deletion wraps reset) keeps
 * reads blocked until the outermost finishes, and a report mounted mid-boundary starts blocked too.
 */
let boundaries = 0;
// Registered once per tab, before any report's own listener: a boundary anywhere drops the
// in-memory copy even while /stats is closed.
if (typeof window !== "undefined") {
  listenPrivateBoundary((phase) => {
    dropCache();
    boundaries = phase === "start" ? boundaries + 1 : Math.max(0, boundaries - 1);
  });
  window.addEventListener(ACCOUNT_CHANGE, () => {
    try {
      const p = readProfile();
      if (!p || p.stealth || p.signedOut || !acceptsCurrent(p.accepted)) dropCache();
    } catch {
      dropCache();
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === PROFILE_KEY) dropCache();
  });
}

function privacyOf(): { privacy: Privacy; profile: StoredProfile | null } {
  let profile;
  try {
    profile = readProfile();
  } catch {
    return { privacy: "error", profile: null };
  }
  if (!profile || profile.signedOut || !acceptsCurrent(profile.accepted))
    return { privacy: "signed-out", profile: null };
  if (profile.stealth) return { privacy: "stealth", profile };
  return { privacy: "ok", profile };
}

export function useReportData(revisions: readonly { challenge: string; revision: string }[]) {
  const [device] = useState(() => privateView<DeviceEvidence>());
  const local = useSyncExternalStore(device.subscribe, device.getSnapshot, device.getSnapshot);
  const [privacy, setPrivacy] = useState<Privacy>("reading");
  const [history, setHistory] = useState<HistoryStatus>({ state: "idle" });
  const [receipts, setReceipts] = useState<Record<string, ReceiptState>>({});
  const [cohorts, setCohorts] = useState<Record<string, CohortRead | "unavailable">>({});
  /** Bumped by every clear, so receipts are requested again for the same revisions. */
  const [epoch, setEpoch] = useState(0);
  const generation = useRef(0);
  const aborts = useRef(new Set<AbortController>());
  const blocked = useRef(false);
  /** Set by a boundary while this report is open; a new visit (mount) starts without it. */
  const held = useRef(false);

  /** Synchronously forget everything shown and everything in flight. */
  const clear = useCallback(
    (block = false) => {
      generation.current++;
      for (const a of aborts.current) a.abort();
      aborts.current.clear();
      device.invalidate(block);
      setHistory({ state: "idle" });
      setReceipts({});
      setCohorts({});
      setEpoch((e) => e + 1);
    },
    [device],
  );

  const readDevice = useCallback(
    (profile: StoredProfile) =>
      device.read(async () => {
        const store = await openPracticeStore();
        try {
          const dump = await store.dump();
          return {
            attempts: localHistory(dump),
            progress: readProgress(),
            profile,
            at: new Date().toISOString(),
          };
        } finally {
          store.close();
        }
      }),
    [device],
  );

  const loadHistory = useCallback(
    async (more = false, previous: UploadedHistory | null = null) => {
      const ticket = generation.current;
      const live = () => ticket === generation.current && !blocked.current && !boundaries;
      let identity;
      try {
        const store = await openPracticeStore();
        try {
          identity = await store.existingIdentity();
        } finally {
          store.close();
        }
      } catch {
        identity = null;
      }
      if (!live()) return;
      if (!identity) {
        setHistory({
          state: "no-uploads",
          message: "No uploads are linked to this browser, so the report uses this device only.",
        });
        return;
      }
      if (!more && cache?.participant === identity.participant && Date.now() - cache.at < HISTORY_TTL_MS) {
        setHistory({ state: "ready", value: cache.value });
        return;
      }
      setHistory((h) => (h.state === "ready" && more ? h : { state: "loading" }));
      // A later page failing keeps the pages already read; live() still discards everything after a boundary.
      const failed = (): HistoryStatus =>
        more && previous
          ? { state: "ready", value: previous, notice: "More uploads unavailable right now." }
          : { state: "unavailable", message: "Your uploads can't be read right now, so the report uses this device only." };
      const controller = new AbortController();
      aborts.current.add(controller);
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.parse(to) - (HISTORY_DAYS - 1) * 86400000).toISOString().slice(0, 10);
      try {
        const response = await fetch("/api/private-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...identity,
            window: historyWindow({ from, to, after: previous?.next ?? "" }),
          }),
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (!live()) return;
        if (!response.ok) {
          if ([401, 403, 410].includes(response.status)) {
            dropCache();
            setHistory({
              state: "unauthorized",
              message: "Your uploads couldn't be verified as yours from this browser, so the report uses this device only.",
            });
          } else if (response.status === 429) {
            setHistory(
              more && previous
                ? { state: "ready", value: previous, notice: "More uploads can be read in a minute." }
                : { state: "limited", message: "Your uploads were read a moment ago. Try again in a minute; this device's evidence is shown meanwhile." },
            );
          } else setHistory(failed());
          return;
        }
        const page = (await response.json()) as UploadedHistory;
        if (!live()) return;
        const merged = new Map(
          [...(previous?.attempts ?? []), ...page.attempts].map((a) => [`${a.attempt}:${a.revision}`, a]),
        );
        const unavailable = new Map(
          [...(previous?.unavailable ?? []), ...page.unavailable].map((a) => [a.attempt, a]),
        );
        const all = [...merged.values()];
        const value: UploadedHistory = {
          ...page,
          // Freshness is only as good as the oldest page read.
          readAt: previous?.readAt ?? page.readAt,
          attempts: all.slice(0, HISTORY_MAX_ATTEMPTS),
          next: all.length >= HISTORY_MAX_ATTEMPTS ? null : page.next,
          unavailable: [...unavailable.values()],
        };
        keep(identity.participant, value);
        setHistory({ state: "ready", value });
      } catch {
        if (live()) setHistory(failed());
      } finally {
        aborts.current.delete(controller);
      }
    },
    [],
  );

  const start = useCallback(() => {
    if (blocked.current || boundaries) return;
    const { privacy, profile } = privacyOf();
    setPrivacy(privacy);
    if (privacy !== "ok" || !profile) {
      // Stealth and signed-out read nothing: no device evidence, history or comparisons.
      clear();
      dropCache();
      return;
    }
    void readDevice(profile);
    if (held.current)
      setHistory({
        state: "held",
        message: "Not re-read after the reset or import. Open the report again to include your uploads.",
      });
    else void loadHistory();
  }, [clear, readDevice, loadHistory]);

  useEffect(() => {
    start();
    const destructive = () => {
      flushSync(() => clear());
      start();
    };
    const deviceOnly = () => {
      const { privacy, profile } = privacyOf();
      if (privacy === "ok" && profile && !blocked.current && !boundaries) void readDevice(profile);
    };
    const storage = (e: StorageEvent) => {
      if (e.key === null || e.key === PROFILE_KEY) destructive();
      else if (e.key === PROGRESS_KEY) deviceOnly();
    };
    const stop = listenPrivateBoundary((phase) => {
      if (phase === "start") {
        blocked.current = true;
        // Reset, import and deletion: this report re-reads only the device. Uploads return on a
        // later visit (a new mount); deletion's tombstone and cleared identity refuse even that.
        held.current = true;
        flushSync(() => clear(true));
      } else if (!boundaries) {
        // Only the outermost finish reopens reads; the module listener has already counted it.
        blocked.current = false;
        device.release();
        start();
      }
    });
    window.addEventListener(ACCOUNT_CHANGE, destructive);
    window.addEventListener(PROGRESS_CHANGE, deviceOnly);
    window.addEventListener("focus", deviceOnly);
    window.addEventListener("storage", storage);
    return () => {
      stop();
      clear();
      window.removeEventListener(ACCOUNT_CHANGE, destructive);
      window.removeEventListener(PROGRESS_CHANGE, deviceOnly);
      window.removeEventListener("focus", deviceOnly);
      window.removeEventListener("storage", storage);
    };
  }, [start, clear, readDevice, device]);

  // Model receipts for the exact revisions chapter 4 shows; bounded by the report's task limit.
  const wanted = revisions.map((r) => `${r.challenge}/${r.revision}`).join("|");
  /** Revisions read or being read since the last clear, so a changed selection only asks for new ones. */
  const requested = useRef({ epoch: -1, revisions: new Set<string>() });
  useEffect(() => {
    if (privacy !== "ok" || !wanted) return;
    if (requested.current.epoch !== epoch) requested.current = { epoch, revisions: new Set() };
    const done = requested.current.revisions;
    const pending = new Set<string>();
    const ticket = generation.current;
    const controller = new AbortController();
    aborts.current.add(controller);
    const live = () =>
      ticket === generation.current && !blocked.current && !boundaries && !controller.signal.aborted;
    for (const pair of wanted.split("|")) {
      const [challenge, revision] = pair.split("/");
      if (done.has(revision)) continue;
      done.add(revision);
      pending.add(revision);
      setReceipts((r) => (revision in r ? r : { ...r, [revision]: "loading" }));
      void fetch(
        `/api/model-receipts/${encodeURIComponent(challenge)}/${encodeURIComponent(revision)}`,
        { cache: "no-store", signal: controller.signal, redirect: "error" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = (await response.json()) as ReceiptRead;
          if (!live()) return;
          setReceipts((r) => ({
            ...r,
            [revision]: data.state === "ready" && Array.isArray(data.receipts) ? data.receipts : "unavailable",
          }));
        })
        .catch(() => {
          if (live()) setReceipts((r) => ({ ...r, [revision]: "unavailable" }));
        })
        .finally(() => pending.delete(revision));
    }
    const set = aborts.current;
    return () => {
      controller.abort();
      set.delete(controller);
      // Reads cut short here never finished: let the next selection ask for them again.
      for (const revision of pending) done.delete(revision);
    };
  }, [privacy, wanted, epoch]);

  // Human cohorts: no request at all while switched off (docs/human-cohorts.md).
  useEffect(() => {
    if (!COHORTS_ENABLED || privacy !== "ok" || !wanted) return;
    const ticket = generation.current;
    const controller = new AbortController();
    aborts.current.add(controller);
    const live = () =>
      ticket === generation.current && !blocked.current && !boundaries && !controller.signal.aborted;
    for (const pair of wanted.split("|")) {
      const [challenge, revision] = pair.split("/");
      void fetch(`/api/cohort/${encodeURIComponent(challenge)}/${encodeURIComponent(revision)}`, {
        cache: "no-store",
        signal: controller.signal,
        redirect: "error",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = (await response.json()) as CohortRead;
          if (live()) setCohorts((c) => ({ ...c, [revision]: Array.isArray(data.groups) ? data : "unavailable" }));
        })
        .catch(() => {
          if (live()) setCohorts((c) => ({ ...c, [revision]: "unavailable" }));
        });
    }
    const set = aborts.current;
    return () => {
      controller.abort();
      set.delete(controller);
    };
  }, [privacy, wanted, epoch]);

  const more = useCallback(() => {
    if (history.state === "ready" && history.value.next) void loadHistory(true, history.value);
  }, [history, loadHistory]);

  return { privacy, local, history, receipts, cohorts, more };
}
