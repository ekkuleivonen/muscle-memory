import type { Metadata } from "next";
import { hookFor } from "../../../lib/hooks";
import { LANGUAGES } from "../../../lib/languages";
import { getLibrary } from "../../../lib/load";
import {
  outcomeLines,
  outcomeSentence,
  type Outcome,
} from "../../../lib/outcome";
import { inspectCard, startCopy } from "../../../lib/share";
import { YourTurn } from "./your-turn";
import { Arrived } from "./arrived";
import { SharedCode } from "./shared-code";
import { SharedHeader, Unavailable } from "./unavailable";
import { Receipt } from "../../(browse)/_components/result-card";

type Props = { params: Promise<{ card: string }> };

/** What a card shows. */
function view(card: Outcome, label: string, title: string, live: string) {
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

async function read(props: Props) {
  const link = inspectCard((await props.params).card);
  const { findIssue } = await getLibrary();
  if (link.kind !== "outcome") return { link, issue: undefined };
  const card = link.outcome;
  const issue = findIssue(card.k);
  const label = LANGUAGES.find((l) => l.id === card.l)?.label ?? card.l;
  return {
    link,
    issue,
    label,
    shown: issue ? view(card, label, issue.title, issue.revision) : undefined,
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
 * challenge to try. Public, like /start. The card is whatever the link says; it is a brag, not
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
  if (!issue || !shown)
    return (
      <Unavailable
        title="That challenge isn't available any more"
        body={`This result is for ${link.outcome.k}, which has been retired, so it isn't shown.`}
      />
    );
  return (
    <div className="legal home">
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
            {startCopy(issue.key, shown.sameVersion).lede}
          </p>
          <div className="home-actions">
            <YourTurn
              challengeKey={issue.key}
              label={startCopy(issue.key, shown.sameVersion).cta}
            />
            <span className="home-note">No email needed.</span>
          </div>
        </section>
        <SharedCode />
      </main>
    </div>
  );
}
