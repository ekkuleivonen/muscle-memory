import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import { getChallenges } from "../../lib/load";
import { summarize } from "../../lib/challenges";
import { TermFooter } from "../_terminal/footer";
import { Dashboard } from "./stats";
import "../_terminal/terminal.css";
import "./stats.css";
export const metadata: Metadata = {
  title: "Your report",
  robots: { index: false, follow: false },
};
export default async function StatsPage() {
  await requireConsent("/stats");
  const { challenges } = await getChallenges();
  return (
    <>
      <Dashboard catalog={challenges.map(summarize)} />
      <TermFooter trail={[{ label: "your report", href: "/stats" }]} />
    </>
  );
}
