/** Draft transport only. No live configuration enables this write path. */
import { INGEST_URL } from "./ingest";
import type { Profile } from "./profile";
import type { PracticeStore } from "../../../packages/browser/practice-store";
export const COMPARISON_PRIVACY_ENABLED = false;
export type PrivacySync = "pending" | "confirmed" | "conflict";
export function comparisonAge(
  age: Profile["age"],
): "adult" | "non-adult" | "unknown" {
  if (age === "16-17") return "non-adult";
  return ["18-24", "25-34", "35-44", "45-54", "55+"].includes(age ?? "")
    ? "adult"
    : "unknown";
}
/** No automatic conflict retry: a stale tab must never silently undo another tab's exclusion. */
export async function syncComparisonPrivacy(
  store: PracticeStore,
  stealth: boolean,
  age: Profile["age"],
  expectedRevision: string | null,
): Promise<{ state: PrivacySync; revision?: string }> {
  if (!COMPARISON_PRIVACY_ENABLED || !INGEST_URL) return { state: "pending" };
  try {
    const response = await fetch(
      `${INGEST_URL}/v1/participants/${encodeURIComponent(await store.participantId())}/comparison-privacy`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          secret: await store.deviceSecret(),
          stealth,
          age: comparisonAge(age),
          expectedRevision,
        }),
      },
    );
    if (response.status === 409) return { state: "conflict" };
    if (!response.ok) return { state: "pending" };
    const body = await response.json();
    return typeof body.revision === "string"
      ? { state: "confirmed", revision: body.revision }
      : { state: "pending" };
  } catch {
    return { state: "pending" };
  }
}
