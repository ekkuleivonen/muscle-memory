import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_COOKIE, hasConsent } from "./profile";

/**
 * Every app page needs the current Terms accepted, nothing more: without them it sends people
 * to /consent (one click) and back to `path`. The profile questions are never required.
 */
export async function requireConsent(path: string): Promise<void> {
  const store = await cookies();
  if (!hasConsent(store.get(CONSENT_COOKIE)?.value))
    redirect(`/consent?next=${encodeURIComponent(path)}`);
}
