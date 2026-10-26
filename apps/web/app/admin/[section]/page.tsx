import { notFound } from "next/navigation";
import { requireAdmin } from "../../../lib/admin-server";
const sections = {
  authoring: [
    "Challenge authoring",
    "Draft, publish and archive controls are not implemented. Published challenges are currently managed through reviewed repository changes.",
  ],
  benchmarks: [
    "Benchmarks",
    "No benchmark service is connected. No model runs, scores or jobs are available here.",
  ],
  statistics: [
    "Aggregate statistics",
    "Aggregate challenge statistics are not implemented. This area does not query or display player records.",
  ],
} as const;
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await requireAdmin();
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  const [title, text] = sections[section as keyof typeof sections];
  return (
    <>
      <h1>{title}</h1>
      <p>{text}</p>
      <a href="/admin">Back to challenges</a>
    </>
  );
}
