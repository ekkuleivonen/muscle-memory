import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isOnboarded,
  ONBOARDING_COOKIE,
  returnPath,
} from "../../lib/onboarding";
import "./terminal.css";
import { Terminal } from "./terminal";

export const metadata: Metadata = { title: "Setup · Muscle Memory" };

/**
 * Onboarding runs once. Signed-in visits go straight on, unless Settings asked to go
 * through the questions again (`?again=1`).
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = returnPath(params.next);
  const again = params.again === "1";
  const store = await cookies();
  if (!again && isOnboarded(store.get(ONBOARDING_COOKIE)?.value))
    redirect(next ?? "/");
  return <Terminal next={next} again={again} />;
}
