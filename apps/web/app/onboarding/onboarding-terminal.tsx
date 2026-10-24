"use client";
import {
  acceptance,
  acceptTerms,
  ensureHandle,
  readProfile,
  saveProfile,
  startSession,
} from "../../lib/account";
import { acceptsCurrent, type Acceptance } from "../../lib/legal";
import { languageLabel } from "../../lib/library";
import type { Profile } from "../../lib/onboarding";
import type { Json } from "../../../../packages/domain/json";
import { logProfile } from "../(browse)/_components/board-log";
import type { Answer } from "../_terminal/prompts";
import { RUNNABLE_LANGUAGES } from "../../../../packages/runner/engines";
import { QUESTIONS, toProfile } from "../_terminal/questions";
import {
  Banner,
  profileLines,
  TermLink,
  Terminal,
  type TerminalApi,
} from "../_terminal/terminal";

/**
 * New-hire setup, run once: the paperwork (Terms and Privacy Notice), profile questions, a
 * stack summary and the handle, then on to the app. Later changes happen in /settings.
 * `next` is where the person was heading, already checked to be same-site.
 */
export function OnboardingTerminal({ next }: { next: string | null }) {
  return <Terminal run={(t) => onboard(t, next)} />;
}

async function onboard(t: TerminalApi, next: string | null) {
  const onward = () => t.go(next ?? "/dashboard", next ?? "your dashboard");
  // Signed-in visits never get here: the server sends them on.
  const stored = readProfile();
  const description =
    "New hire setup: the paperwork, a few questions, then your desk.";
  if (!stored) {
    t.print(<Banner description={description} status="○ not signed in" />);
    const accepted = await paperwork(t);
    await setup(t, accepted);
    return onward();
  }
  const handle = ensureHandle();
  if (!acceptsCurrent(stored.accepted)) {
    // An account from before the current Terms: sign the new ones, then carry on.
    t.print(
      <Banner
        description="Welcome back."
        status={`○ ${handle} · waiting for your signature`}
      />,
    );
    await paperwork(t, true);
    acceptTerms();
    startSession();
    return onward();
  }
  // Back after logging out.
  t.print(
    <Banner
      description="Welcome back. Sign in, or go through setup again."
      status={`○ ${handle} · signed out`}
    />,
  );
  const yes = await t.ask({
    kind: "confirm",
    id: "login",
    message: `Sign in as ${handle}?`,
    initial: true,
  });
  if (!yes) await setup(t);
  else startSession();
  onward();
}

async function setup(t: TerminalApi, accepted?: Acceptance) {
  t.print(
    "",
    <span>Welcome aboard. Let&apos;s set up your profile.</span>,
    <span className="t-dim">
      Arrow keys or numbers to choose · Esc skips a question · answers stay on
      this device.
    </span>,
    "",
  );
  const answers: Record<string, Answer> = {};
  for (const question of QUESTIONS) {
    const answer = await t.ask(question);
    if (answer !== null) answers[question.id] = answer;
  }
  const profile: Profile = toProfile(answers);
  const { handle } = saveProfile(profile, accepted);
  void logProfile({ from: "onboarding", answers: { ...profile } as Json });
  const { languages = [], editor } = profile;
  t.print(
    "",
    ...languages.map((id) => (
      <span>
        <span className="t-dim">→</span> {languageLabel(id)}{" "}
        {RUNNABLE_LANGUAGES.includes(id) ? (
          <span className="t-ok">✔</span>
        ) : (
          <span className="t-dim">coming soon</span>
        )}
      </span>
    )),
    ...(editor
      ? [
          <span>
            <span className="t-dim">→</span> setting editor keybindings to{" "}
            {editor === "vim" ? "Vim" : "VS Code-style"}{" "}
            <span className="t-ok">✔</span>
          </span>,
        ]
      : []),
    <span className="t-ok">Your desk is ready.</span>,
    <span>
      <span className="t-dim">→</span> your handle is{" "}
      <span className="t-brand">{handle}</span>{" "}
      <span className="t-dim">(anonymous, handed out at random)</span>
    </span>,
    ...profileLines(profile),
    <span className="t-dim">
      Saved in this browser only. Change any of it later in{" "}
      <TermLink href="/settings">settings</TermLink>.
    </span>,
  );
}

/**
 * New-hire paperwork: what the Terms and Privacy Notice say, in four lines, then a signature.
 * There is no way in without it, so declining just asks again.
 */
async function paperwork(t: TerminalApi, updated = false): Promise<Acceptance> {
  t.print(
    "",
    updated ? (
      <span>
        The paperwork changed since you last signed. Same deal, mostly:
      </span>
    ) : (
      <span>
        First, the paperwork. Every new job has some; ours fits on one screen.
      </span>
    ),
    <span>
      <span className="t-dim">→</span> We record what you do here, keystroke by
      keystroke: every key you press in the editor and when, your edits and
      pastes, the pages and files you open, test runs and their output, and
      when you switch away (never to what), and send it to our servers as you
      go. That&apos;s the product: it picks
      your next issues and shows how you compare with other people and LLMs.
    </span>,
    <span>
      <span className="t-dim">→</span> We use it to make better issues, and may
      publish anonymised stats and datasets. Rather not? Go stealth any time in
      settings.
    </span>,
    <span>
      <span className="t-dim">→</span> Others never see your results next to
      your handle, and we don&apos;t sell your personal data.
    </span>,
    <span>
      <span className="t-dim">→</span> Code you write stays yours; you give us a
      licence to use and publish it.
    </span>,
    <span className="t-dim">
      The full{" "}
      <TermLink href="/terms" newTab>
        Terms
      </TermLink>{" "}
      and{" "}
      <TermLink href="/privacy" newTab>
        Privacy Notice
      </TermLink>{" "}
      are short and written for humans.
    </span>,
    "",
  );
  for (;;) {
    const yes = await t.ask({
      kind: "confirm",
      id: "terms",
      message:
        "I'm 16 or older and accept the Terms and Privacy Notice. Sign here?",
      initial: true,
    });
    if (yes) return acceptance();
    t.print(
      <span className="t-dim">
        No signature, no desk: it&apos;s the one rule. Nothing has been saved.
        Take your time.
      </span>,
    );
  }
}
