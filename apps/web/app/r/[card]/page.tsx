import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LANGUAGES } from "../../../lib/languages";
import { getLibrary } from "../../../lib/load";
import { decodeResult, sentence } from "../../../lib/result";
import { Arrived } from "./arrived";

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
  const title = found
    ? sentence(found.result, found.label)
    : "The five-minute test · Muscle Memory";
  const description = "One bug, no AI. Can you still fix it? The five-minute test.";
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
  const play = `/play?${new URLSearchParams({ ref: result.c, lang: result.l })}`;
  return (
    <div className="legal home play">
      <header className="legal-head">
        <Link href="/" className="workspace-name">
          <img className="logo-mark" src="/logo.svg" alt="" width={22} height={22} />
          muscle memory
        </Link>
      </header>
      <Arrived referral={result.c} />
      <main className="legal-body home-body">
        <section className="result-card shared">
          <p className="result-kicker">Shipped without AI</p>
          <h2>
            {issue.key} <span className="dim">· {issue.title}</span>
          </h2>
          <ul className="result-stats">
            <li>
              <b>{result.m}</b> {result.m === 1 ? "minute" : "minutes"}
            </li>
            <li>
              <b>{result.r}</b> {result.r === 1 ? "test run" : "test runs"}
            </li>
            <li>
              <b>{result.h || "No"}</b> {result.h === 1 ? "hint" : "hints"}
            </li>
            <li>
              <b>{label}</b>
            </li>
          </ul>
        </section>
        <section className="home-hero">
          <h1>
            You use AI every day.
            <br />
            <span className="home-punch">Can you still code without it?</span>
          </h1>
          <p className="home-lede">
            One small bug in a real codebase, in your language. No completion, no chat, no
            generated code. About five minutes.
          </p>
          <div className="home-actions">
            <Link className="home-cta" href={play}>
              Your turn →
            </Link>
            <span className="home-note">No account, no email.</span>
          </div>
        </section>
      </main>
    </div>
  );
}
