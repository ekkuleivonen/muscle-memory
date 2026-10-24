import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isOnboarded,
  ONBOARDING_COOKIE,
  returnPath,
} from "../../lib/onboarding";
import "../_terminal/terminal.css";
import { OnboardingTerminal } from "./onboarding-terminal";

export const metadata: Metadata = { title: "Setup · Muscle Memory" };

/** Onboarding runs once: signed-in visits go straight on. Later changes live in /settings. */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = returnPath((await searchParams).next);
  const store = await cookies();
  if (isOnboarded(store.get(ONBOARDING_COOKIE)?.value)) redirect(next ?? "/dashboard");
  return <OnboardingTerminal next={next} />;
}
