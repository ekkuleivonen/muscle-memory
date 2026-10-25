import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import { getChallenges } from "../../lib/load";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { Picker } from "./picker";

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Every Muscle Memory challenge: search and filter by language, difficulty and topic, then solve one without AI.",
};

/**
 * Every listed challenge in one picker, like fzf: a search line, filters to toggle, the list,
 * and a preview of the highlighted one. Enter starts practice. The search is the URL's `q`.
 * Challenges travel as a JSON string: React's serializer would drop a "__proto__" example key.
 */
export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q ?? "";
  await requireConsent(
    q ? `/challenges?q=${encodeURIComponent(q)}` : "/challenges",
  );
  const { challenges } = await getChallenges();
  return (
    <>
      <Picker challengesJson={JSON.stringify(challenges)} initialQuery={q} />
      <TermFooter trail={[{ label: "challenges", href: "/challenges" }]} />
    </>
  );
}
