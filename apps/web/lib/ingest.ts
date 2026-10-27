/**
 * Where recorded practice is uploaded (apps/ingest, docs/telemetry.md). Uploads are on only
 * when NEXT_PUBLIC_INGEST_URL is set at build time, such as "/ingest" in production or
 * "http://localhost:8787/ingest" against `wrangler dev`.
 */
import type { PracticeStore } from "../../../packages/browser/practice-store";

export const INGEST_URL = (process.env.NEXT_PUBLIC_INGEST_URL ?? "").replace(/\/+$/, "");

/**
 * Asks the server to erase this device's uploaded records, proving ownership with the device
 * secret. Throws when the server cannot confirm, so the caller keeps the secret.
 */
export async function eraseUploaded(store: PracticeStore): Promise<void> {
  if (!INGEST_URL) return;
  const participantId = await store.participantId();
  const secret = await store.deviceSecret();
  let response: Response;
  try {
    response = await fetch(
      `${INGEST_URL}/v1/participants/${encodeURIComponent(participantId)}/delete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret }),
        credentials: "same-origin",
      },
    );
  } catch {
    throw new Error("The server couldn't confirm deletion. Your local data and deletion key were kept; retry when online.");
  }
  if (!response.ok)
    throw new Error("The server didn't confirm deletion. Your local data and deletion key were kept; retry later.");
}

/**
 * Asks the server for a copy of this device's uploaded records, proving ownership with the
 * device secret. The reference is what the person emails us; null when the server holds
 * nothing from this browser. Throws when the server cannot confirm.
 */
export async function requestAccess(store: PracticeStore): Promise<string | null> {
  if (!INGEST_URL) return null;
  const participantId = await store.participantId();
  const secret = await store.deviceSecret();
  let response: Response;
  try {
    response = await fetch(
      `${INGEST_URL}/v1/participants/${encodeURIComponent(participantId)}/access`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret }),
        credentials: "same-origin",
      },
    );
  } catch {
    throw new Error("The server couldn't be reached, so nothing was requested. Try again when you're online.");
  }
  if (!response.ok)
    throw new Error("The server didn't confirm the request. Try again later.");
  const { reference } = (await response.json()) as { reference?: string };
  return reference ?? null;
}
