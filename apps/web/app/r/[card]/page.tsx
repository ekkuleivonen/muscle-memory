import type { Metadata } from "next";
import { LANGUAGES } from "../../../lib/languages";
import { getChallenges } from "../../../lib/load";
import {
  outcomeLines,
  outcomeSentence,
  type Outcome,
} from "../../../lib/outcome";
import { inspectCard, startCopy } from "../../../lib/share";
import { NOT_INDEXED, SITE_NAME } from "../../../lib/site";
import { YourTurn } from "./your-turn";
import { Arrived } from "./arrived";
import { SharedCode } from "./shared-code";
import { Unavailable } from "./unavailable";
import { Receipt } from "../../_components/result-card";
import { Banner } from "../../_terminal/banner";
import { TermFooter } from "../../_terminal/footer";
import "../../_terminal/terminal.css";
import "../../share.css";

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
  const { findChallenge } = await getChallenges();
  if (link.kind !== "outcome") return { link, challenge: undefined };
  const card = link.outcome;
  const challenge = findChallenge(card.k);
  const label = LANGUAGES.find((l) => l.id === card.l)?.label ?? card.l;
  return {
    link,
    challenge,
    label,
    shown: challenge ? view(card, label, challenge.title, challenge.revision) : undefined,
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { challenge, label, shown } = await read(props);
  if (!challenge || !shown)
    return { title: "Result not available", robots: { index: false } };
  const title = shown.headline;
  const description = `${challenge.summary || challenge.title} Try the same ${label} challenge yourself.`;
  const url = `/r/${(await props.params).card}`;
  return {
    title: { absolute: title },
    description,
    // Every share is its own address with the same challenge behind it: previews, not results.
    robots: NOT_INDEXED,
    openGraph: { title, description, url, siteName: SITE_NAME, locale: "en_US", type: "website" },
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
  const { link, challenge, shown } = await read(props);
  if (link.kind === "malformed")
    return (
      <Unavailable
        title="This result link is incomplete"
        body="Part of the link is missing or changed, so there's no result to show. Ask whoever sent it to copy it again."
      />
    );
  if (!challenge || !shown)
    return (
      <Unavailable
        title="That challenge isn't available any more"
        body={`This result is for ${link.outcome.k}, which has been retired, so it isn't shown.`}
      />
    );
  return (
    <>
      <div className="term">
        <Banner description="Practice without AI." heading={false} />
        <Arrived referral={shown.referral} />
        <main className="t-prose home-fold t-shared">
          <Receipt
            top={`${challenge.key} · shared result`}
            headline={shown.headline}
            detail={`${shown.earlier ? "Completed on an earlier version of this challenge; you start from the current one. " : ""}The editor offers no AI completion, chat or generated code: a practice condition, not proof about other tools. As they shared it; not a verified record.`}
            lines={shown.lines}
            completed={shown.completed}
          />
          <h1 className="t-line home-headline">
            <strong>Same challenge.</strong>
            <br />
            <strong className="t-brand">Your turn.</strong>
          </h1>
          <p className="t-line">
            {challenge.hook ?? (challenge.summary || challenge.title)}{" "}
            {startCopy(challenge.key, shown.sameVersion).lede}
          </p>
          <div className="home-start">
            <YourTurn
              challengeKey={challenge.key}
              label={startCopy(challenge.key, shown.sameVersion).cta}
            />
            <span className="t-dim">No email needed.</span>
          </div>
          <SharedCode />
        </main>
      </div>
      <TermFooter trail={[{ label: "shared result", href: "" }]} />
    </>
  );
}
