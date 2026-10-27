"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { openPracticeStore } from "../../../packages/browser/practice-store";
import { ACCOUNT_CHANGE, readProfile } from "./account";
import { PROFILE_KEY } from "./profile";
import { listenPrivateBoundary } from "./private-boundary";
import {
  comparisonAge,
  comparisonPrivacyRequest,
  COMPARISON_PRIVACY_ENABLED,
} from "./comparison-privacy";
import {
  PrivacyController,
  PRIVACY_SAVE,
  type PrivacySnapshot,
} from "./comparison-privacy-controller";

/** One settings view, with no persistence of acknowledgements or background enrollment. */
export function useComparisonPrivacy() {
  const controller = useMemo(
    () =>
      new PrivacyController(
        {
          read: async (participant) => {
            const store = await openPracticeStore();
            try {
              return await comparisonPrivacyRequest(store, participant, {
                action: "read",
              });
            } finally {
              store.close();
            }
          },
          update: async (local, expectedRevision) => {
            const store = await openPracticeStore();
            try {
              return await comparisonPrivacyRequest(store, local.participant, {
                action: "update",
                expectedRevision,
                stealth: local.stealth,
                age: local.age,
              });
            } finally {
              store.close();
            }
          },
        },
        COMPARISON_PRIVACY_ENABLED,
      ),
    [],
  );
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const actions = useMemo(() => {
    let serial = 0,
      suspended = false;
    const refresh = async (
      operation: "observe" | "save" | "retry" | "applyReviewed" = "observe",
    ) => {
      const current = ++serial;
      controller.invalidate(
        operation === "applyReviewed" || operation === "retry",
      );
      if (!COMPARISON_PRIVACY_ENABLED || suspended) return;
      const profile = readProfile();
      if (!profile || profile.signedOut) {
        controller.clear();
        return;
      }
      const store = await openPracticeStore();
      let participant: string;
      try {
        participant = await store.participantId();
      } finally {
        store.close();
      }
      if (
        current !== serial ||
        suspended ||
        JSON.stringify(readProfile()) !== JSON.stringify(profile)
      )
        return;
      const local: PrivacySnapshot = {
        participant,
        stealth: profile.stealth === true,
        age: comparisonAge(profile.profile.age),
      };
      await controller[operation](local);
    };
    return {
      refresh,
      invalidate: (blocked: boolean) => {
        serial++;
        suspended = blocked;
        controller.clear();
      },
    };
  }, [controller]);
  useEffect(() => {
    actions.invalidate(false);
    const observe = () => {
      void actions.refresh();
    };
    const save = () => {
      void actions.refresh("save");
    };
    const storage = (e: StorageEvent) => {
      if (!e.key || e.key === PROFILE_KEY) {
        controller.clear();
        observe();
      }
    };
    const stop = listenPrivateBoundary((phase) => {
      actions.invalidate(phase === "start");
      if (phase === "finish") observe();
    });
    window.addEventListener(ACCOUNT_CHANGE, observe);
    window.addEventListener(PRIVACY_SAVE, save);
    window.addEventListener("storage", storage);
    window.addEventListener("online", observe);
    window.addEventListener("focus", observe);
    observe();
    return () => {
      stop();
      actions.invalidate(true);
      window.removeEventListener(ACCOUNT_CHANGE, observe);
      window.removeEventListener(PRIVACY_SAVE, save);
      window.removeEventListener("storage", storage);
      window.removeEventListener("online", observe);
      window.removeEventListener("focus", observe);
    };
  }, [actions, controller]);
  return {
    view,
    retry: () => actions.refresh("retry"),
    applyReviewed: () => actions.refresh("applyReviewed"),
  };
}
