import { LEGAL_DRAFT, LEGAL_UPDATED, LEGAL_VERSION } from "../../lib/legal";
import { Markdown } from "../(browse)/_components/markdown";

export function LegalPage({
  title,
  source,
}: {
  title: string;
  source: string;
}) {
  return (
    <article>
      {LEGAL_DRAFT && (
        <p className="legal-draft" role="note">
          <b>Draft.</b> This hasn&apos;t been reviewed by a lawyer yet, and the
          bits in [brackets] are placeholders. Don&apos;t rely on it until this
          box is gone.
        </p>
      )}
      <h1>{title}</h1>
      <p className="faint">
        Last updated {LEGAL_UPDATED} · version {LEGAL_VERSION}
      </p>
      <Markdown source={source} className="legal-text" />
    </article>
  );
}
