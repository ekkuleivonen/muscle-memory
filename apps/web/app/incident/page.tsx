import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ ref?: string }> };

/**
 * The retired incident's front door. Old links (the home page, shared incident cards) lead to
 * the five-minute test, keeping only the referral code; nobody's result travels with them.
 */
export default async function LegacyIncident({ searchParams }: Props) {
  const { ref } = await searchParams;
  redirect(ref ? `/play?${new URLSearchParams({ ref })}` : "/play");
}
