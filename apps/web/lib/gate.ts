import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isOnboarded, ONBOARDING_COOKIE } from "./onboarding";

/** Sends people who have not finished onboarding there first, then back to `path`. */
export async function requireOnboarding(path: string): Promise<void> {
  const store = await cookies();
  if (!isOnboarded(store.get(ONBOARDING_COOKIE)?.value))
    redirect(`/onboarding?next=${encodeURIComponent(path)}`);
}
