"use client";
import { ErrorView } from "./_terminal/error-view";
import "./style.css";
import "./_terminal/terminal.css";

/** When even the root layout fails: the same page, in a document of its own. */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div className="term" role="alert">
          <ErrorView {...props} />
        </div>
      </body>
    </html>
  );
}
