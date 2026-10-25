import { redirect } from "next/navigation";

/**
 * The retired incident's front door. Old links (the home page, shared incident cards, with any
 * ?v= or ?ref=) lead to INC-1 as the ordinary issue it now is; nobody's result travels with
 * them. A shared card already noted its referral when it was opened (/r/<card>).
 */
export default function LegacyIncident() {
  redirect("/issues/INC-1");
}
