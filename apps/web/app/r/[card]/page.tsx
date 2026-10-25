import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LANGUAGES } from "../../../lib/languages";
import { getLibrary } from "../../../lib/load";
import { isIncident } from "../../../lib/incident";
import {
  comparisonLine,
  decodeResult,
  incidentSentence,
  incidentTime,
  sentence,
} from "../../../lib/result";
import { Arrived } from "./arrived";
import { Receipt } from "../../(browse)/_components/result-card";

type Props = { params: Promise<{ card: string }> };

async function read(props: Props) {
  const result = decodeResult((await props.params).card);
  if (!result) return null;
  const issue = (await getLibrary()).findIssue(result.k);
  if (!issue) return null;
  const label = LANGUAGES.find((l) => l.id === result.l)?.label ?? result.l;
  return { result, issue, label };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const found = await read(props);
  const incident = found && isIncident(found.result.k);
  const title = found
    ? incident
      ? incidentSentence(found.result)
      : sentence(found.result, found.label)
    : "The five-minute test · Muscle Memory";
  const description = incident
    ? "Production is down. AI is down. You're on call. Take the same incident."
    : "One bug, no AI. Try a small fix at your own pace. The five-minute test.";
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Muscle Memory" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A shared result: what someone did, and an invitation to try. Public, like /play. The card is
 * whatever the link says; it is a brag, not a record.
 */
export default async function SharedResult(props: Props) {
  const found = await read(props);
  if (!found) redirect("/play");
  const { result, issue, label } = found;
  if (isIncident(result.k)) return <SharedIncident result={result} />;
  const play = `/play?${new URLSearchParams({ ref: result.c, lang: result.l })}`;
  return (
    <div className="legal home play">
      <header className="legal-head">
        <Link href="/" className="workspace-name">
          <img
            className="logo-mark"
            src="/logo.svg"
            alt=""
            width={22}
            height={22}
          />
          muscle memory
        </Link>
      </header>
      <Arrived referral={result.c} />
      <main className="legal-body home-body">
        <section className="result-card shared">
          <Receipt
            top="muscle memory · shared result"
            headline="Someone fixed a real bug without AI."
            detail={`“${issue.title}”, in ${label}, from memory, with no autocomplete.`}
            metrics={result}
            comparison={comparisonLine(result, label)}
          />
        </section>
        <section className="home-hero">
          <h1>
            You use AI every day.
            <br />
            <span className="home-punch">
              Keep your coding skills in practice.
            </span>
          </h1>
          <p className="home-lede">
            One small bug in a real codebase, in your language. No completion,
            no chat, no generated code. About five minutes.
          </p>
          <div className="home-actions">
            <Link className="home-cta" href={play}>
              Your turn →
            </Link>
            <span className="home-note">
              No email needed. Progress stays in this browser.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

/** A shared incident report: the same incident, at the same version, for whoever opens it. */
function SharedIncident({
  result,
}: {
  result: NonNullable<ReturnType<typeof decodeResult>>;
}) {
  const take = `/incident?${new URLSearchParams({
    ref: result.c,
    ...(result.iv ? { v: result.iv } : {}),
  })}`;
  return (
    <div className="legal home play">
      <header className="legal-head">
        <Link href="/" className="workspace-name">
          <img
            className="logo-mark"
            src="/logo.svg"
            alt=""
            width={22}
            height={22}
          />
          muscle memory
        </Link>
      </header>
      <Arrived referral={result.c} />
      <main className="legal-body home-body">
        <section className="result-card shared">
          <Receipt
            top={`incident INC-1${result.iv ? ` · version ${result.iv}` : ""} · resolved`}
            headline={`Someone restored checkout in ${incidentTime(result)}.`}
            detail={`${result.a && result.a > 1 ? "A replay" : "Their first response"}${result.iv ? ` on version ${result.iv}` : ""}. A report is filed only once a fix passes every check, is merged and is deployed. This card is theirs to share, not a verified record.`}
            metrics={result}
          />
        </section>
        <section className="home-hero">
          <h1>
            Production is down. AI is down.
            <br />
            <span className="home-punch">You&apos;re on call.</span>
          </h1>
          <p className="home-lede">
            The same incident{result.iv ? `, version ${result.iv}` : ""}: the
            same broken checkout, the same log, the same failing test and the
            same team that can&apos;t ask its assistant. Their numbers are
            above; yours stay private unless you share them. No timer.
          </p>
          <div className="home-actions">
            <Link className="home-cta" href={take}>
              Take the same incident →
            </Link>
            <span className="home-note">
              No email needed. Progress stays in this browser.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
