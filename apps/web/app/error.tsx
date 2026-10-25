"use client";
import { TermFooter } from "./_terminal/footer";
import { ErrorView } from "./_terminal/error-view";
import "./_terminal/terminal.css";

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="term" role="alert">
        <ErrorView {...props} />
      </div>
      <TermFooter trail={[{ label: "error", href: "" }]} />
    </>
  );
}
