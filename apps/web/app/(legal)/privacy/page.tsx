import type { Metadata } from "next";
import { pageMetadata } from "../../../lib/site";
import { LegalPage } from "../legal-page";
import { PRIVACY } from "./privacy";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Notice",
  description:
    "What Muscle Memory records while you practise, why, who sees it, and how to go stealth or delete everything.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      source={PRIVACY}
      file="privacy.md"
      href="/privacy"
    />
  );
}
