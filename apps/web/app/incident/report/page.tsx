import { redirect } from "next/navigation";

/**
 * The retired incident report. A merged fix is an ordinary pull request now, so the link leads
 * to this browser's own pull requests (through the Terms, like every tracker page).
 */
export default function LegacyIncidentReport() {
  redirect("/pulls");
}
