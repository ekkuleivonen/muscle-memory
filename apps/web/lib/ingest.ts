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
    throw new Error("The server couldn't be reached, so nothing was deleted. Try again when you're online.");
  }
  if (!response.ok)
    throw new Error("The server didn't confirm the deletion, so nothing was deleted. Try again later.");
}
