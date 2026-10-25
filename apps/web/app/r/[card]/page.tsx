import type { Metadata } from "next";
import Link from "next/link";
import { hookFor } from "../../../lib/hooks";
import { LANGUAGES } from "../../../lib/languages";
import { getLibrary } from "../../../lib/load";
import { outcomeLines, outcomeSentence } from "../../../lib/outcome";
import { receiptLines, sentence } from "../../../lib/result";
import { inspectCard, tryHref, type CardLink } from "../../../lib/share";
import { Arrived } from "./arrived";
import { SharedCode } from "./shared-code";
import { SharedHeader, Unavailable } from "./unavailable";
import { Receipt } from "../../(browse)/_components/result-card";

type Props = { params: Promise<{ card: string }> };

/** What either card version shows, in one shape. */
function view(
  link: Extract<CardLink, { kind: "result" | "outcome" }>,
  label: string,
  title: string,
  live: string,
) {
  if (link.kind === "outcome") {
    const card = link.outcome;
    return {
      key: card.k,
      referral: card.c,
      headline: outcomeSentence(card, label, title),
      lines: outcomeLines(card),
      completed: true,
      // The card names the full revision it was checked on; say so when the challenge has
      // moved on, and never present today's starter as the version they completed.
      earlier: `sha256:${card.rv}` !== live,
      sameVersion: `sha256:${card.rv}` === live,
    };
  }
  const card = link.result;
  return {
    key: card.k,
    referral: card.c,
    headline: sentence(card, label, title),
    lines: receiptLines(card),
    completed: !card.ev || card.ev.state === "merged",
    earlier: false,
    // A v2 card carries no revision, so it can't be called the same version.
    sameVersion: false,
  };
}

async function read(props: Props) {
  const link = inspectCard((await props.params).card);
  const { findIssue } = await getLibrary();
  if (link.kind !== "result" && link.kind !== "outcome")
    return {
      link,
      issue:
        link.kind === "older" && link.key ? findIssue(link.key) : undefined,
    };
  const card = link.kind === "outcome" ? link.outcome : link.result;
  const issue = findIssue(card.k);
  const label = LANGUAGES.find((l) => l.id === card.l)?.label ?? card.l;
  return {
    link,
    issue,
    label,
    shown: issue ? view(link, label, issue.title, issue.revision) : undefined,
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { issue, label, shown } = await read(props);
  if (!issue || !shown)
    return { title: "Result not available · Muscle Memory", robots: { index: false } };
  const title = shown.headline;
  const description = `${issue.summary || issue.title} The same ${label} challenge, from its starting code.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Muscle Memory" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A shared outcome: what someone did on one challenge, named by its title, and the same
 * challenge to try. Public, like /play. The card is whatever the link says; it is a brag, not
 * a record. A link that does not decode, or names a challenge that is gone, gets a page saying
 * so, never something in its place.
 */
export default async function SharedResult(props: Props) {
  const { link, issue, shown } = await read(props);
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
  if (!issue || !shown)
    return (
      <Unavailable
        title="That challenge isn't available any more"
        body={`This result is for ${(link.kind === "outcome" ? link.outcome : link.result).k}, which has been retired, so it isn't shown.`}
      />
    );
  return (
    <div className="legal home play">
      <SharedHeader />
      <Arrived referral={shown.referral} />
      <main className="legal-body home-body">
        <section className="result-card shared">
          <Receipt
            top={`muscle memory · ${issue.key} · shared result`}
            headline={shown.headline}
            detail={`${shown.earlier ? "Completed on an earlier version of this challenge; you start from the current one. " : ""}The editor offers no AI completion, chat or generated code: a practice condition, not proof about other tools. As they shared it; not a verified record.`}
            lines={shown.lines}
            completed={shown.completed}
          />
        </section>
        <section className="home-hero">
          <h1>
            Same challenge.
            <br />
            <span className="home-punch">Your turn.</span>
          </h1>
          <p className="home-lede">
            {hookFor(issue) ?? (issue.summary || issue.title)}{" "}
            {shown.sameVersion
              ? "You start from the same starting code they did"
              : "You start from the challenge's current starting code"}
            , in your own attempt: nothing of theirs comes with it.
          </p>
          <div className="home-actions">
            <Link className="home-cta" href={tryHref(issue.key)}>
              {/* Same version only when the card names the live revision; a v2 card names none. */}
              {shown.sameVersion
                ? `Try ${issue.key} yourself →`
                : `Try the current version of ${issue.key} →`}
            </Link>
            <span className="home-note">No email needed.</span>
          </div>
        </section>
        <SharedCode />
      </main>
    </div>
  );
}
