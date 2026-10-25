import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { PRIVACY } from "./privacy";

export const metadata: Metadata = { title: "Privacy Notice · Muscle Memory" };

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
