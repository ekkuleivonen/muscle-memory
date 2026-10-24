import type { Metadata } from "next";
import { safeNext } from "../../lib/onboarding";
import "./terminal.css";
import { Terminal } from "./terminal";

export const metadata: Metadata = { title: "Setup · Muscle Memory" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next, "");
  return <Terminal next={next || null} />;
}
