/**
 * Terminal prompt model. Pure key handling, so the React view only renders state and
 * forwards keys; every prompt is also answerable by pointer through the same functions.
 */
export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

export type Prompt = (
  | {
      kind: "select";
      id: string;
      message: string;
      choices: readonly Choice[];
      /** Index highlighted at first, e.g. the current answer. */
      initial?: number;
    }
  | {
      kind: "multiselect";
      id: string;
      message: string;
      choices: readonly Choice[];
      /** Fewest choices Enter accepts. */
      min: number;
      /** Indexes ticked at first, e.g. the current answer. */
      initialPicked?: readonly number[];
    }
  | { kind: "confirm"; id: string; message: string; initial: boolean }
  | { kind: "text"; id: string; message: string }
) & {
  /** What Esc does, for the hint line: "skips" unless told otherwise. */
  escape?: string;
};

export type Answer = string | string[] | boolean;

export interface ListState {
  cursor: number;
  picked: readonly number[];
  error: string;
}

export const initialList: ListState = { cursor: 0, picked: [], error: "" };

export type ListResult =
  | { type: "state"; state: ListState }
  | { type: "submit"; value: string | string[] }
  | { type: "ignore" };

type ListPrompt = Extract<Prompt, { kind: "select" | "multiselect" }>;

function move(state: ListState, cursor: number, size: number): ListResult {
  return {
    type: "state",
    state: { ...state, cursor: (cursor + size) % size, error: "" },
  };
}

function toggle(state: ListState, index: number): ListState {
  const picked = state.picked.includes(index)
    ? state.picked.filter((i) => i !== index)
    : [...state.picked, index].sort((a, b) => a - b);
  return { cursor: index, picked, error: "" };
}

/** Submits a multiselect, or explains why it cannot be submitted yet. */
export function submitMulti(
  prompt: Extract<Prompt, { kind: "multiselect" }>,
  state: ListState,
): ListResult {
  if (state.picked.length < prompt.min)
    return {
      type: "state",
      state: {
        ...state,
        error: `Pick at least ${prompt.min}. Space toggles the highlighted option.`,
      },
    };
  return {
    type: "submit",
    value: state.picked.map((i) => prompt.choices[i].value),
  };
}

/** Pointer equivalent of moving to an option and pressing Space (multi) or Enter (single). */
export function choose(
  prompt: ListPrompt,
  state: ListState,
  index: number,
): ListResult {
  if (prompt.kind === "select")
    return { type: "submit", value: prompt.choices[index].value };
  return { type: "state", state: toggle(state, index) };
}

export function listKey(
  prompt: ListPrompt,
  state: ListState,
  key: string,
): ListResult {
  const size = prompt.choices.length;
  switch (key) {
    case "ArrowUp":
    case "k":
      return move(state, state.cursor - 1, size);
    case "ArrowDown":
    case "j":
      return move(state, state.cursor + 1, size);
    case "Home":
      return move(state, 0, size);
    case "End":
      return move(state, size - 1, size);
    case " ":
      return prompt.kind === "multiselect"
        ? { type: "state", state: toggle(state, state.cursor) }
        : { type: "ignore" };
    case "a":
      if (prompt.kind !== "multiselect") return { type: "ignore" };
      return {
        type: "state",
        state: {
          ...state,
          picked: state.picked.length === size ? [] : [...Array(size).keys()],
          error: "",
        },
      };
    case "Enter":
      return prompt.kind === "select"
        ? { type: "submit", value: prompt.choices[state.cursor].value }
        : submitMulti(prompt, state);
  }
  // Digits pick by their printed number.
  const index = Number(key) - 1;
  if (/^[1-9]$/.test(key) && index < size) return choose(prompt, state, index);
  return { type: "ignore" };
}
