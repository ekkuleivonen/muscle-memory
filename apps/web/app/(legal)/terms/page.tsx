import type { Metadata } from "next";
import { pageMetadata } from "../../../lib/site";
import { LegalPage } from "../legal-page";
import { TERMS } from "./terms";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  description:
    "The terms for practising on Muscle Memory: your account, playing fair, your code and activity, and the insights we may publish.",
  path: "/terms",
});

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
