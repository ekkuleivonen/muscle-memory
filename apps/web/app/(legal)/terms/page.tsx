import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { TERMS } from "./terms";

export const metadata: Metadata = { title: "Terms · Muscle Memory" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      source={TERMS}
      file="terms.md"
      href="/terms"
    />
  );
}
