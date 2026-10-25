import type { ReactNode } from "react";

/** The wordmark in figlet's ANSI Shadow font; Calvin S where that would not fit (phones). */
const WORDMARK = [
  "███╗   ███╗██╗   ██╗███████╗ ██████╗██╗     ███████╗    ███╗   ███╗███████╗███╗   ███╗ ██████╗ ██████╗ ██╗   ██╗",
  "████╗ ████║██║   ██║██╔════╝██╔════╝██║     ██╔════╝    ████╗ ████║██╔════╝████╗ ████║██╔═══██╗██╔══██╗╚██╗ ██╔╝",
  "██╔████╔██║██║   ██║███████╗██║     ██║     █████╗      ██╔████╔██║█████╗  ██╔████╔██║██║   ██║██████╔╝ ╚████╔╝",
  "██║╚██╔╝██║██║   ██║╚════██║██║     ██║     ██╔══╝      ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██║   ██║██╔══██╗  ╚██╔╝",
  "██║ ╚═╝ ██║╚██████╔╝███████║╚██████╗███████╗███████╗    ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║╚██████╔╝██║  ██║   ██║",
  "╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝╚══════╝╚══════╝    ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝",
].join("\n");
const WORDMARK_NARROW = [
  "┌┬┐┬ ┬┌─┐┌─┐┬  ┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┬─┐┬ ┬",
  "││││ │└─┐│  │  ├┤   │││├┤ ││││ │├┬┘└┬┘",
  "┴ ┴└─┘└─┘└─┘┴─┘└─┘  ┴ ┴└─┘┴ ┴└─┘┴└─ ┴",
].join("\n");

/**
 * The terminal header: the wordmark, what this terminal is for, and who is signed in.
 * Screen readers get the words, not the drawing.
 */
export function Banner({
  description,
  status,
}: {
  description: string;
  status: ReactNode;
}) {
  return (
    <div className="t-banner">
      <h1 className="t-sr">muscle memory</h1>
      <div className="t-art t-art-wide" aria-hidden>
        {WORDMARK}
      </div>
      <div className="t-art t-art-narrow" aria-hidden>
        {WORDMARK_NARROW}
      </div>
      <div className="t-banner-text">
        <div>{description}</div>
        <div className="t-dim">{status}</div>
      </div>
    </div>
  );
}
