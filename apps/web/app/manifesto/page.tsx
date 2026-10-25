import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, pageMetadata } from "../../lib/site";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";

const TITLE = "I read code every day. Then I tried writing some.";
const DESCRIPTION =
  "Why Muscle Memory exists: a year of working with AI, one surprising attempt at coding without it, and a question worth answering with data.";
const AUTHOR = "Ekku Leivonen";
const PUBLISHED = "2026-10-26";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description: DESCRIPTION, path: "/manifesto" }),
  authors: [{ name: AUTHOR }],
  // Its own opengraph-image, so setting Open Graph here keeps the picture.
  openGraph: {
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: "/manifesto",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "article",
    publishedTime: PUBLISHED,
    authors: [AUTHOR],
  },
};

/** What search engines read about the piece: an article, by whom, when. */
const ARTICLE = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  author: { "@type": "Person", name: AUTHOR },
  datePublished: PUBLISHED,
  mainEntityOfPage: `${SITE_URL}/manifesto`,
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

/**
 * Why Muscle Memory exists, in the founder's words: what AI gave, what one attempt without it
 * showed, what we want to find out and why the data matters, what it can and can't say, and
 * the invitation. Public, like the home page.
 */
export default function ManifestoPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE) }}
      />
      <div className="term">
        <main className="t-prose">
          <h1 className="t-doc-title">{TITLE}</h1>
          <div className="markdown t-md">
            <h3>What AI gave me</h3>
            <p>
              For about a year now, I&apos;ve been using AI for pretty much
              everything in my workflow. And honestly, I&apos;ve loved a lot of
              it. I get to work on bigger problems, think about architecture,
              and build things I wouldn&apos;t have had time to build before.
            </p>
            <p>
              I think we should be using these tools. The expectations from
              companies, investors and the people around us make sense to me.
            </p>

            <h3>What surprised me</h3>
            <p>
              But little by little, I handed over more of the work. Every now
              and then, I caught myself handing over some of the thinking too.
            </p>
            <p>
              The other day, I thought I&apos;d try a LeetCode problem. Just
              for shits and giggles. See how it goes after a year of working
              this way.
            </p>
            <p>
              I was genuinely shocked by how much I struggled to write the
              code.
            </p>
            <p>
              I still read code every day. I review what the models produce.
              But sitting in front of an editor and coming up with it myself
              felt very different.
            </p>
            <p>
              It reminded me of learning a language. You can understand
              someone speaking. You can read what they write. Then it&apos;s
              your turn to speak, and you can&apos;t find the words.
            </p>
            <p>
              That was the feeling. And I wasn&apos;t expecting it.
            </p>

            <h3>What I want to find out</h3>
            <p>
              I don&apos;t know how much of that was rust, the particular
              problem, or the way I&apos;ve changed how I work. But it made me
              curious enough to build Muscle Memory.
            </p>
            <p>
              I want to see whether you&apos;re noticing something similar. I
              have a hunch some of you might be as surprised as I was. Maybe
              you&apos;ll find it easier than you expected. I want to know that
              too. Where do people struggle, where do they do well, and how
              does that change with practice?
            </p>

            <h3>Why the data matters beyond me</h3>
            <p>
              There are plenty of opinions online about what AI is doing to
              developers. I don&apos;t trust the confidence of those opinions
              very much. I&apos;m someone who needs data.
            </p>
            <ul>
              <li>
                <strong>Developers</strong> can look at their own experience,
                not just read about everyone else&apos;s.
              </li>
              <li>
                <strong>Educators</strong> can see where practice is needed.
              </li>
              <li>
                <strong>Teams and tool builders</strong> can ask better
                questions about which abilities AI-assisted work exercises, and
                which it leaves unused.
              </li>
            </ul>

            <h3>What the data can and can&apos;t say</h3>
            <p>
              Challenge data can describe how people solve these problems. It
              won&apos;t, by itself, prove that AI caused anyone to lose a
              skill. Strong performance and surprising non-results matter just
              as much as struggle.
            </p>
            <p>
              With your consent, we record how you work through a challenge:
              your keystrokes and edits in the editor, your runs and their
              results, and the optional answers you give about yourself. We
              keep what happened apart from what we conclude from it. Nothing
              is shown to anyone else next to your name, you can go stealth to
              stay out of anything we publish, and you can delete everything
              any time. The <Link href="/privacy">Privacy Notice</Link> lists
              it all. How and when findings are shared is still being worked
              out, and we&apos;ll say so here when it is.
            </p>
            <p>
              The editor has syntax highlighting, type errors and hover types.
              Completion, chat and generated code are off. Python, JavaScript,
              TypeScript, SQL, HTML, PHP, Ruby, Go, C, C++, C# and Java run in
              your browser.
            </p>

            <h3>Try one</h3>
            <p>
              Pick a coding challenge, write the solution yourself, and see how
              it goes. Contribute knowingly, and help us see what actually
              happens. I&apos;m curious whether my experience sounds familiar.
            </p>
            <p>
              <Link href="/start">Try your first challenge →</Link>
            </p>
            <p className="t-dim">— {AUTHOR}</p>
          </div>
        </main>
      </div>
      <TermFooter trail={[{ label: "manifesto", href: "/manifesto" }]} />
    </>
  );
}
