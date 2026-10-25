import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { requireConsent } from "../../../../../lib/gate";
import { getLibrary } from "../../../../../lib/load";
import { PullView } from "../../../_components/pulls";
import { Sep, Topbar } from "../../../_components/topbar";

type Props = { params: Promise<{ key: string; number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key, number } = await params;
  return { title: `${key.toUpperCase()} #${number} · Muscle Memory` };
}

/**
 * One pull request, `/pulls/FN-1/2`. The pull request itself lives in this browser, so the
 * server sends every published revision of the issue and the page picks the one it ran on.
 */
export default async function PullPage({ params }: Props) {
  const { key, number } = await params;
  await requireConsent(`/pulls/${key}/${number}`);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const { findIssue, revisionsOf, issues } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) permanentRedirect(`/pulls/${issue.key}/${n}`);
  return (
    <>
      <Topbar>
        <Link href="/pulls">Pull requests</Link>
        <Sep />
        <span className="mono">
          {issue.key} #{n}
        </span>
      </Topbar>
      <main className="content">
        <PullView
          issue={{
            key: issue.key,
            slug: issue.slug,
            title: issue.title,
            revision: issue.revision,
          }}
          candidates={[issue, ...issues.filter((i) => i.key !== issue.key)]}
          number={n}
          revisionsJson={JSON.stringify(revisionsOf(issue.slug))}
        />
      </main>
    </>
  );
}
