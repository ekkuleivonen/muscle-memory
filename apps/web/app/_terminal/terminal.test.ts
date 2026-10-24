import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProfile, QUESTIONS, toProfile } from "./questions";
import {
  choose,
  confirmKey,
  formatAnswer,
  initialList,
  listKey,
  startState,
  type ListResult,
  type ListState,
  type Prompt,
} from "./prompts";

const select: Prompt & { kind: "select" } = {
  kind: "select",
  id: "pick",
  message: "Pick",
  choices: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ],
};
const multi: Prompt & { kind: "multiselect" } = {
  ...select,
  kind: "multiselect",
  min: 1,
};

function keys(prompt: typeof select | typeof multi, ...pressed: string[]) {
  let state: ListState = initialList;
  let last: ListResult = { type: "ignore" };
  for (const key of pressed) {
    last = listKey(prompt, state, key);
    if (last.type === "state") state = last.state;
  }
  return { state, last };
}

test("select moves with arrows and vim keys, wrapping at both ends", () => {
  assert.equal(keys(select, "ArrowDown", "j").state.cursor, 2);
  assert.equal(keys(select, "ArrowDown", "j", "j").state.cursor, 0);
  assert.equal(keys(select, "k").state.cursor, 2);
  assert.equal(keys(select, "End", "Home").state.cursor, 0);
});

test("select submits the highlighted choice, or a numbered one directly", () => {
  assert.deepEqual(keys(select, "j", "Enter").last, {
    type: "submit",
    value: "b",
  });
  assert.deepEqual(keys(select, "3").last, { type: "submit", value: "c" });
  assert.equal(keys(select, "4").last.type, "ignore");
  assert.equal(keys(select, " ").last.type, "ignore");
});

test("multiselect toggles, keeps choice order and enforces its minimum", () => {
  const empty = keys(multi, "Enter");
  assert.equal(empty.last.type, "state");
  assert.match(empty.state.error, /at least 1/);
  assert.deepEqual(keys(multi, "3", "Home", " ", "Enter").last, {
    type: "submit",
    value: ["a", "c"],
  });
  assert.deepEqual(keys(multi, " ", " ").state.picked, []);
  assert.deepEqual(keys(multi, "a").state.picked, [0, 1, 2]);
  assert.deepEqual(keys(multi, "a", "a").state.picked, []);
});

test("pointer choice submits a select and toggles a multiselect", () => {
  assert.deepEqual(choose(select, initialList, 1), {
    type: "submit",
    value: "b",
  });
  const toggled = choose(multi, initialList, 1);
  assert.equal(toggled.type, "state");
  assert.deepEqual(toggled.type === "state" && toggled.state.picked, [1]);
});

test("confirm takes y/n and falls back to its default on Enter", () => {
  const confirm = {
    kind: "confirm",
    id: "c",
    message: "Sure?",
    initial: false,
  } as const;
  assert.equal(confirmKey(confirm, "Y"), true);
  assert.equal(confirmKey(confirm, "n"), false);
  assert.equal(confirmKey(confirm, "Enter"), false);
  assert.equal(confirmKey(confirm, "x"), null);
  assert.equal(formatAnswer(confirm, true), "yes");
});

test("answers become a profile; skipped questions are left out", () => {
  const answers = {
    experience: "professional",
    aiUse: "daily",
    languages: ["typescript", "cpp"],
    goal: "sharp",
    editor: "vim",
  };
  assert.deepEqual(
    QUESTIONS.map((q) => q.id),
    Object.keys(answers),
  );
  assert.deepEqual(toProfile(answers), answers);
  assert.equal(
    formatAnswer(QUESTIONS[2], answers.languages),
    "TypeScript, C++",
  );
  const partial = toProfile({ languages: ["go"] });
  assert.deepEqual(partial, { languages: ["go"] });
  assert.deepEqual(describeProfile(partial), [
    ["experience", "skipped"],
    ["aiUse", "skipped"],
    ["languages", "Go"],
    ["goal", "skipped"],
    ["editor", "skipped"],
  ]);
});

test("prompts can start from the current answer, as settings does", () => {
  assert.deepEqual(startState({ ...select, initial: 2 }), {
    cursor: 2,
    picked: [],
    error: "",
  });
  assert.deepEqual(startState({ ...multi, initialPicked: [2, 0] }), {
    cursor: 0,
    picked: [0, 2],
    error: "",
  });
  assert.equal(startState(select).cursor, 0);
  assert.equal(
    formatAnswer(
      { kind: "text", id: "t", message: "Type it" },
      "Quiet-Compiler-4821",
    ),
    "Quiet-Compiler-4821",
  );
});
