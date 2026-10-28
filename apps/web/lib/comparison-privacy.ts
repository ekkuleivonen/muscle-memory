/** Disabled draft transport. Secrets are read only at the request boundary and never retained. */
import { INGEST_URL } from "./ingest";
import type { Profile } from "./profile";
import type { PracticeStore } from "../../../packages/browser/practice-store";
import type {
  ComparisonPreference,
  PrivacyReply,
} from "./comparison-privacy-controller";
export const COMPARISON_PRIVACY_ENABLED = false;
export function comparisonAge(
  age: Profile["age"],
): ComparisonPreference["age"] {
  if (age === "16-17") return "non-adult";
  return ["18-24", "25-34", "35-44", "45-54", "55+"].includes(age ?? "")
    ? "adult"
    : "unknown";
}
export async function comparisonPrivacyRequest(
  store: PracticeStore,
  participant: string,
  operation:
    | { action: "read" }
    | ({
        action: "update";
        expectedRevision: string | null;
      } & ComparisonPreference),
): Promise<PrivacyReply> {
  if (!COMPARISON_PRIVACY_ENABLED || !INGEST_URL) return { status: "pending" };
  try {
    if ((await store.participantId()) !== participant)
      return { status: "pending" };
    const response = await fetch(
      `${INGEST_URL}/v1/participants/${encodeURIComponent(participant)}/comparison-privacy`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          secret: await store.deviceSecret(),
          ...operation,
        }),
      },
    );
    if (response.status === 409) return { status: "conflict" };
    if (response.status === 410) return { status: "deleted" };
    if (!response.ok) return { status: "pending" };
    return projectPrivacyResponse(response.status, await response.json());
  } catch {
    return { status: "pending" };
  }
}

/** A 202/provisional body can never become a confirmed UI state. Extra fields are discarded. */
export function projectPrivacyResponse(
  status: number,
  body: unknown,
): PrivacyReply {
  const value = (body as { value?: unknown })?.value;
  if (status === 200 && value === null) return { status: "ok", value: null };
  if (!value || typeof value !== "object") return { status: "pending" };
  const v = value as Record<string, unknown>;
  if (
    typeof v.stealth !== "boolean" ||
    !["adult", "non-adult", "unknown"].includes(v.age as string) ||
    typeof v.revision !== "string" ||
    !/^[a-f0-9-]{36}$/.test(v.revision)
  )
    return { status: "pending" };
  const projected = {
    stealth: v.stealth,
    age: v.age as ComparisonPreference["age"],
    revision: v.revision,
  };
  if (status === 202 && v.acknowledged === false)
    return { status: "pending", value: projected };
  return status === 200 && v.acknowledged === true
    ? { status: "ok", value: projected }
    : { status: "pending" };
}
