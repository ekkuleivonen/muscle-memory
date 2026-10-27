import { LEGAL_UPDATED, LEGAL_VERSION } from "../../lib/legal";
import { Markdown } from "../_components/markdown";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";

/**
 * Terms or Privacy as a document read in the terminal: the title and version, then the
 * Markdown as a terminal reader shows it; the status bar says which. The text itself lives
 * in terms.ts and privacy.ts; changing it means a new LEGAL_VERSION.
 */
export function LegalPage({
  title,
  source,
  file,
  href,
}: {
  title: string;
  source: string;
  /** The file it is, e.g. terms.md: the status bar names it without the extension. */
  file: string;
  href: string;
}) {
  const crumb = file.replace(/\.md$/, "");
  return (
    <>
      <div className="term">
        <main className="t-prose">
          <article>
            <h1 className="t-doc-title">{title}</h1>
            <p className="t-line t-dim">
              Last updated {LEGAL_UPDATED} · version {LEGAL_VERSION}
            </p>
            <Markdown source={source} className="t-md" />
          </article>
        </main>
      </div>
      <TermFooter trail={[{ label: crumb, href }]} />
    </>
  );
}
