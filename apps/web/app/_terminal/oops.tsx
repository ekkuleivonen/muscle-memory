"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { KeyActions, type KeyAction } from "./key-actions";

/**
 * A page that went wrong, as a terminal session that went wrong: the command, what the shell
 * said, a big status code, one honest line, and where to go next by key or click.
 */
export function Oops({
  code,
  command,
  output,
  quip,
  explain,
  actions,
}: {
  code: string;
  command: string;
  /** The shell's reply, in red. */
  output: readonly string[];
  /** A wry aside, in grey. */
  quip: ReactNode;
  /** What happened, plainly. */
  explain: ReactNode;
  /** Run before the default ways out (home, challenges). */
  actions?: readonly KeyAction[];
}) {
  const router = useRouter();
  return (
    <main className="t-prose t-oops">
      <div className="t-oops-session">
        <p className="t-line">
          <span className="t-ok">~</span> <span className="t-accent">$</span>{" "}
          {command}
        </p>
        {output.map((line) => (
          <p key={line} className="t-line t-err">
            {line}
          </p>
        ))}
      </div>
      <pre className="t-oops-code" aria-hidden>
        {big(code)}
      </pre>
      <h1 className="t-sr">Error {code}</h1>
      <p className="t-line">{explain}</p>
      <p className="t-line t-dim"># {quip}</p>
      <KeyActions
        id="oops"
        message="Where to?"
        autoFocus
        actions={[
          ...(actions ?? []),
          {
            label: "start a challenge",
            kind: actions?.length ? "plain" : "primary",
            run: () => router.push("/start"),
          },
          { label: "browse challenges", run: () => router.push("/challenges") },
          { label: "go home", run: () => router.push("/") },
        ]}
      />
    </main>
  );
}

/** Digits in figlet's ANSI Shadow, so the code reads like the banner. */
const DIGITS: Record<string, string[]> = {
  "0": [" ██████╗ ", "██╔═████╗", "██║██╔██║", "████╔╝██║", "╚██████╔╝", " ╚═════╝ "],
  "4": ["██╗  ██╗", "██║  ██║", "███████║", "╚════██║", "     ██║", "     ╚═╝"],
  "5": ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
};

function big(code: string): string {
  const glyphs = [...code].map((c) => DIGITS[c]);
  if (glyphs.some((g) => !g)) return code;
  return glyphs[0].map((_, row) => glyphs.map((g) => g[row]).join("")).join("\n");
}
