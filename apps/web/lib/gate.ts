import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasConsent, isOnboarded, ONBOARDING_COOKIE, PLAY_COOKIE } from "./onboarding";

/** Sends people who have not finished onboarding there first, then back to `path`. */
export async function requireOnboarding(path: string): Promise<void> {
  const store = await cookies();
  if (!isOnboarded(store.get(ONBOARDING_COOKIE)?.value))
    redirect(`/onboarding?next=${encodeURIComponent(path)}`);
}

/**
 * The IDE and pull requests: open to anyone who accepted the current Terms, including through
 * the five-minute test, which skips the setup questions.
 */
export async function requireConsent(path: string): Promise<void> {
  const store = await cookies();
  if (!hasConsent(store.get(ONBOARDING_COOKIE)?.value, store.get(PLAY_COOKIE)?.value))
    redirect(`/onboarding?next=${encodeURIComponent(path)}`);
}
