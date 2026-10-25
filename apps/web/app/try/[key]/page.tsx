import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { hookFor } from "../../../lib/hooks";
import { languageLabel } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { CONSENT_COOKIE, hasConsent } from "../../../lib/profile";
import { tryHref } from "../../../lib/share";
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
    return { title: "Challenge not available · Muscle Memory", robots: { index: false } };
  const title = `${issue.key}: ${issue.title}`;
  const description = `${hookFor(issue) ?? issue.summary} A ${languageLabel(issue.language)} challenge, in an editor with no AI assistance.`;
  return {
    title: `${title} · Muscle Memory`,
    description,
    openGraph: { title, description, siteName: "Muscle Memory" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const show = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * A challenge's public page, where a shared challenge link lands: its goal and requirements,
 * its published examples, and a fresh start on it. Public, like /start: the link names only the
 * challenge, so nobody's work, attempt or records come with it. Only the examples anyone can
 * run are shown; the checks beyond them stay hidden, as in practice.
 */
export default async function TryIssue(props: Props) {
  const { key } = await props.params;
  const issue = await find(props);
  if (!issue)
    return (
      <Unavailable
        title="That challenge isn't available"
        body={`There's no challenge ${decodeURIComponent(key).slice(0, 24)} here. The link may be incomplete, or the challenge may have been retired.`}
      />
    );
  // One canonical link per challenge: /try/RG-4. A lowercase key or the challenge's id land here.
  if (key !== issue.key) permanentRedirect(tryHref(issue.key));
  const consented = hasConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  const language = languageLabel(issue.language);
  return (
    <div className="legal home play">
      <SharedHeader />
      <main className="legal-body home-body try-issue">
        <p className="home-kicker">
          <span className="mono">{issue.key}</span> · {language} ·{" "}
          {issue.difficulty}
        </p>
        <h1 className="try-title">{issue.title}</h1>
        {(hookFor(issue) ?? issue.summary) && (
          <p className="home-lede">{hookFor(issue) ?? issue.summary}</p>
        )}
        <section className="play-ticket try-ticket" aria-label="The challenge">
          <h2>Goal and requirements</h2>
          <Markdown source={issue.task} />
          {issue.criteria.length > 0 && (
            <>
              <h2>Examples</h2>
              {/* Same shape as ENG-328's ChallengeExamples, which can replace it when composed. */}
              <ol className="try-criteria">
                {issue.criteria.map(({ input, expected }, i) => (
                  <li key={i}>
                    <h3>Example {i + 1}</h3>
                    <dl>
                      <dt>Input</dt>
                      <dd>
                        <pre>{show(input)}</pre>
                      </dd>
                      <dt>Expected output</dt>
                      <dd>
                        <pre>{show(expected)}</pre>
                      </dd>
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
        <TryStart
          issue={{ key: issue.key, slug: issue.slug, revision: issue.revision }}
          consented={consented}
          runnable={issue.runnable}
        />
      </main>
    </div>
  );
}
