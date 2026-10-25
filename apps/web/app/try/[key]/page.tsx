import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { languageLabel } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { CONSENT_COOKIE, hasConsent } from "../../../lib/profile";
import { tryHref } from "../../../lib/share";
import { KIND_LABELS } from "../../(browse)/_components/icons";
import { Markdown } from "../../(browse)/_components/markdown";
import { SharedHeader, Unavailable } from "../../r/[card]/unavailable";
import { TryStart } from "./try-start";
import "../../share.css";

type Props = { params: Promise<{ key: string }> };

async function find({ params }: Props) {
  const { key } = await params;
  return (await getLibrary()).findIssue(decodeURIComponent(key));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const issue = await find(props);
  if (!issue)
    return { title: "Issue not available · Muscle Memory", robots: { index: false } };
  const title = `${issue.key}: ${issue.title}`;
  const description = `${issue.summary} A real bug to fix without AI, in ${languageLabel(issue.language)}.`;
  return {
    title: `${title} · Muscle Memory`,
    description,
    openGraph: { title, description, siteName: "Muscle Memory" },
    twitter: { card: "summary", title, description },
  };
}

const show = (value: unknown) => JSON.stringify(value);

/**
 * An issue's public page, where a shared issue link lands: the ticket as the tracker shows it,
 * and a fresh start on it. Public, like /play: the link names only the issue, so nobody's
 * work, attempt or records come with it.
 */
export default async function TryIssue(props: Props) {
  const { key } = await props.params;
  const issue = await find(props);
  if (!issue)
    return (
      <Unavailable
        title="That issue isn't available"
        body={`There's no issue ${decodeURIComponent(key).slice(0, 24)} here. The link may be incomplete, or the issue may have been retired.`}
      />
    );
  // One canonical link per issue: /try/RG-4. A lowercase key or the issue's id land here.
  if (key !== issue.key) permanentRedirect(tryHref(issue.key));
  const consented = hasConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  const language = languageLabel(issue.language);
  return (
    <div className="legal home play">
      <SharedHeader />
      <main className="legal-body home-body try-issue">
        <p className="home-kicker">
          <span className="mono">{issue.key}</span> · {issue.project.title} ·{" "}
          {issue.kind ? KIND_LABELS[issue.kind] : "Issue"} · {language}
          {issue.difficulty ? ` · ${issue.difficulty}` : ""}
        </p>
        <h1 className="try-title">{issue.title}</h1>
        {issue.summary && <p className="home-lede">{issue.summary}</p>}
        <section className="play-ticket try-ticket" aria-label="The ticket">
          <Markdown source={issue.task} />
          {issue.criteria.length > 0 && (
            <>
              <h2>Acceptance criteria</h2>
              <ul className="try-criteria">
                {issue.criteria.map(({ input, expected }, i) => (
                  <li key={i}>
                    <code>{show(input)}</code> → <code>{show(expected)}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <TryStart
          issue={{ key: issue.key, slug: issue.slug, revision: issue.revision }}
          consented={consented}
          runnable={issue.runnable}
        />
        {issue.project.key === "QUICK" && (
          <p className="faint try-other">
            The same bug is in eight languages:{" "}
            <Link href="/play">pick another</Link>.
          </p>
        )}
      </main>
    </div>
  );
}
