"use client";
import { useState } from "react";
import { answerQuestions, snoozeQuestion } from "../../../lib/account";
import { nextQuestion, type Profile } from "../../../lib/profile";
import { QUESTIONS } from "../../../lib/questions";
import { logProfile } from "./board-log";
import { useAccount } from "./profile-menu";

type Id = keyof Profile;
type From = Parameters<typeof logProfile>[0];

/** Why a question is worth answering, unless the place asking says it better. */
const WHY: Record<Id, string> = {
  experience: "So your times mean something next to everyone else's.",
  aiUse: "The context for everything you do here.",
  languages: "So your backlog and suggestions are in your stack.",
  goal: "So we pick the right tickets for you.",
  editor: "The editor opens with the keys you're used to.",
};

/**
 * A profile question asked in place: the first of `ids` still open (unanswered and not put off),
 * one tap to answer, "Not now" to put it off for a few days. Answering shows the next open one;
 * "Not now" leaves this place quiet until the next visit, so declining never brings on another
 * question. Every answer is recorded `from` this place.
 */
export function Ask({
  ids,
  from,
  why,
  className,
}: {
  ids: readonly Id[];
  from: From;
  /** Reasons that fit this place better than the default ones. */
  why?: Partial<Record<Id, string>>;
  className?: string;
}) {
  const stored = useAccount();
  const [quiet, setQuiet] = useState(false);
  const id = nextQuestion(stored, ids);
  if (!stored || !id || quiet) return null;
  const question = QUESTIONS.find((q) => q.id === id)!;
  const answer = (value: Profile[Id]) => {
    answerQuestions({ [id]: value });
    void logProfile(from);
  };
  return (
    <section className={className ? `ask ${className}` : "ask"} aria-label="A question for you">
      <div className="ask-head">
        <span>
          <b>{question.message}</b>
          <span className="ask-why">{why?.[id] ?? WHY[id]}</span>
        </span>
        <button type="button" className="ask-later" onClick={() => {
            snoozeQuestion(id);
            setQuiet(true);
          }}>
          Not now
        </button>
      </div>
      {question.kind === "multiselect" ? (
        <Pick
          key={id}
          choices={question.choices}
          initial={stored.profile.languages ?? []}
          onSave={(values) => answer(values as Profile["languages"])}
        />
      ) : (
        <div className="ask-choices">
          {question.choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              onClick={() => answer(choice.value as Profile[Id])}
            >
              {choice.label}
              {"hint" in choice && choice.hint && <small>{choice.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Several at once (languages): toggle, then save. Starts from what is on file. */
function Pick({
  choices,
  initial,
  onSave,
}: {
  choices: readonly { value: string; label: string; hint?: string }[];
  initial: readonly string[];
  onSave: (values: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([...initial]);
  const toggle = (value: string) =>
    setPicked((now) => (now.includes(value) ? now.filter((v) => v !== value) : [...now, value]));
  return (
    <div className="ask-choices">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          aria-pressed={picked.includes(choice.value)}
          onClick={() => toggle(choice.value)}
        >
          {choice.label}
          {choice.hint && <small>{choice.hint}</small>}
        </button>
      ))}
      <button
        type="button"
        className="ask-save"
        disabled={!picked.length}
        onClick={() => onSave(choices.map((c) => c.value).filter((v) => picked.includes(v)))}
      >
        Save
      </button>
    </div>
  );
}
