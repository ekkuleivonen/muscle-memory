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
 * The terminal header: the wordmark and a line on what this is.
 * Screen readers get the words, not the drawing; they are the page's heading unless the page
 * has its own.
 */
export function Banner({
  description,
  heading = true,
}: {
  description: ReactNode;
  heading?: boolean;
}) {
  const Name = heading ? "h1" : "p";
  return (
    <div className="t-banner">
      <Name className="t-sr">muscle memory</Name>
      <div className="t-art t-art-wide" aria-hidden>
        {WORDMARK}
      </div>
      <div className="t-art t-art-narrow" aria-hidden>
        {WORDMARK_NARROW}
      </div>
      <div className="t-banner-text">{description}</div>
    </div>
  );
}
