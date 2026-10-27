import { cookies } from "next/headers";
import { hasConsent, CONSENT_COOKIE } from "../../../lib/profile";
import { uploadedHistory } from "../../../lib/uploaded-history-server";
import {
  HistoryRefusal,
  historyWindow,
} from "../../../../../packages/developer-profile/uploaded-history";
import { safeIdentifier } from "../../../../../packages/domain/capture";
export const dynamic = "force-dynamic";
/** No subject in URL. Secret never logged, cached, stored or included in a response. */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", Vary: "Cookie, Origin" };
  const reply = (status: number, error: string, diagnostic?: string) =>
    Response.json(
      { error, ...(diagnostic ? { diagnostic } : {}) },
      { status, headers },
    );
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply(403, "Use the dashboard to load your private history.");
  if (!hasConsent((await cookies()).get(CONSENT_COOKIE)?.value))
    return reply(403, "Accept the current Terms before loading history.");
  let input;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return reply(400, "Invalid history request.");
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "Invalid history request.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        void reader.cancel();
        return reply(413, "History request is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    input = JSON.parse(new TextDecoder().decode(bytes));
    safeIdentifier(input.participant);
    historyWindow(input.window);
    if (
      typeof input.secret !== "string" ||
      input.secret.length < 32 ||
      input.secret.length > 256
    )
      return reply(401, "Device ownership could not be verified.");
  } catch {
    return reply(400, "Invalid history request.");
  }
  try {
    return Response.json(
      await uploadedHistory(
        input.participant,
        input.secret,
        historyWindow(input.window),
      ),
      { headers },
    );
  } catch (error) {
    // Upstream SQL/RPC errors can contain raw payloads or credentials. Never log/render them.
    if (error instanceof HistoryRefusal)
      return reply(error.status, error.message, error.diagnostic);
    return reply(
      503,
      "Uploaded history could not be read. Your device evidence is still available.",
    );
  }
}
