import type { Metadata } from "next";
import Link from "next/link";
import { LANGUAGES } from "../../../lib/languages";
import { getLibrary } from "../../../lib/load";
import { comparisonLine, sentence } from "../../../lib/result";
import { inspectCard, tryHref } from "../../../lib/share";
import { Arrived } from "./arrived";
import { SharedCode } from "./shared-code";
import { SharedHeader, Unavailable } from "./unavailable";
import { Receipt } from "../../(browse)/_components/result-card";

type Props = { params: Promise<{ card: string }> };

async function read(props: Props) {
  const link = inspectCard((await props.params).card);
  const { findIssue } = await getLibrary();
  if (link.kind !== "result")
    return { link, issue: link.kind === "older" && link.key ? findIssue(link.key) : undefined };
  const issue = findIssue(link.result.k);
  const label = LANGUAGES.find((l) => l.id === link.result.l)?.label ?? link.result.l;
  return { link, issue, label };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { link, issue, label } = await read(props);
  if (link.kind !== "result" || !issue)
    return { title: "Result not available · Muscle Memory", robots: { index: false } };
  const title = sentence(link.result, label!);
  const description = `${issue.key}: ${issue.title}. One bug, no AI. Try the same one at your own pace.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Muscle Memory" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A shared result: what someone did on an issue, and the same issue to try. Public, like
 * /play. The card is whatever the link says; it is a brag, not a record. A link that does not
 * decode, or names an issue that is gone, gets a page saying so, never something in its place.
 */
export default async function SharedResult(props: Props) {
  const { link, issue, label } = await read(props);
  if (link.kind === "malformed")
    return (
      <Unavailable
        title="This result link is incomplete"
        body="Part of the link is missing or changed, so there's no result to show. Ask whoever sent it to copy it again."
      />
    );
  if (link.kind === "older")
    return (
      <Unavailable
        title="This result is from an older version"
        body="Result links from before an update can't be shown any more, and we won't guess at what it said."
        issue={issue}
      />
    );
  const { result } = link;
  if (!issue)
    return (
      <Unavailable
        title="That issue isn't available any more"
        body={`This result is for ${result.k}, which has been retired, so it isn't shown.`}
      />
    );
  return (
    <div className="legal home play">
      <SharedHeader />
      <Arrived referral={result.c} />
      <main className="legal-body home-body">
        <section className="result-card shared">
          <Receipt
            top={`muscle memory · ${issue.key} · shared result`}
            headline="Someone fixed a real bug without AI."
            detail={`“${issue.title}”, in ${label}, from memory, with no autocomplete. Their numbers, as they shared them; not a verified record.`}
            metrics={result}
            comparison={comparisonLine(result, label!)}
          />
        </section>
        <section className="home-hero">
          <h1>
            Same issue.
            <br />
            <span className="home-punch">Your turn.</span>
          </h1>
          <p className="home-lede">
            {issue.summary || issue.title} You start from the same code they
            did, in your own editor. No completion, no chat, no generated code.
          </p>
          <div className="home-actions">
            <Link className="home-cta" href={tryHref(issue.key)}>
              Try {issue.key} yourself →
            </Link>
            <span className="home-note">No email needed.</span>
          </div>
        </section>
        <SharedCode />
      </main>
    </div>
  );
}
