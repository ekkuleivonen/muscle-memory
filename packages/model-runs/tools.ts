/**
 * The harness's version, its system prompt and its tools: one per thing a person can do in
 * practice, and nothing else. Changing any of them changes what a run means, so it changes
 * HARNESS_VERSION, and a new version runs as a series of its own.
 */
import type { Json } from "../domain/json";

export const HARNESS_VERSION = "harness-1";

export const SYSTEM_PROMPT = `You are practising on Muscle Memory, a coding practice site. You are given one challenge and its code file, as a person sees them in practice.

Use the tools to change the code, run the examples and submit. Run examples runs the public examples and shows each one in full. Submit checks the code against every case, including hidden ones, and the challenge's rules. The challenge is done when a submission passes every case and no rule applies.

These tools are all you have: there is no other way to run code, read files or look anything up. Replying without a tool call ends your attempt.`;

const object = (properties: Record<string, Json>, required: string[]): Json => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** OpenAI-style tool definitions, as sent. */
export const TOOLS: Json = [
  {
    type: "function",
    function: {
      name: "edit_code",
      description:
        "Replace one piece of the code file. `old` must occur exactly once in the file as it is now; it is replaced by `new`. Returns the whole file afterwards.",
      parameters: object(
        {
          old: { type: "string", description: "Text that occurs exactly once in the file now." },
          new: { type: "string", description: "The text that replaces it." },
        },
        ["old", "new"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "write_code",
      description: "Replace the whole code file with `text`. Returns the file.",
      parameters: object({ text: { type: "string", description: "The new file." } }, ["text"]),
    },
  },
  {
    type: "function",
    function: {
      name: "run_examples",
      description: "Run the public examples against the code as it is now and show the output.",
      parameters: object({}, []),
    },
  },
  {
    type: "function",
    function: {
      name: "submit",
      description:
        "Submit the code as it is now: every case, including hidden ones, and the challenge's rules.",
      parameters: object({}, []),
    },
  },
];

export type ToolName = "edit_code" | "write_code" | "run_examples" | "submit";

export type ParsedCall =
  | { parse: "ok"; name: "edit_code"; old: string; new: string }
  | { parse: "ok"; name: "write_code"; text: string }
  | { parse: "ok"; name: "run_examples" | "submit" }
  | { parse: "invalid-json" | "invalid-arguments" | "unknown-tool"; message: string };

/** Reads a tool call as the model wrote it. Arguments must be exactly what the tool takes. */
export function parseCall(name: string, raw: string): ParsedCall {
  if (!["edit_code", "write_code", "run_examples", "submit"].includes(name))
    return { parse: "unknown-tool", message: `There is no tool named ${JSON.stringify(name)}.` };
  let args: unknown;
  try {
    args = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { parse: "invalid-json", message: "The arguments are not valid JSON." };
  }
  const bad = (message: string): ParsedCall => ({ parse: "invalid-arguments", message });
  if (!args || typeof args !== "object" || Array.isArray(args))
    return bad("The arguments must be a JSON object.");
  const fields = args as Record<string, unknown>;
  const keys = Object.keys(fields).sort();
  const expect = (wanted: string[]) =>
    keys.length === wanted.length && wanted.every((k, i) => keys[i] === k);
  if (name === "edit_code") {
    if (!expect(["new", "old"]) || typeof fields.old !== "string" || typeof fields.new !== "string")
      return bad("edit_code takes `old` and `new`, both strings.");
    return { parse: "ok", name, old: fields.old, new: fields.new };
  }
  if (name === "write_code") {
    if (!expect(["text"]) || typeof fields.text !== "string")
      return bad("write_code takes `text`, a string.");
    return { parse: "ok", name, text: fields.text };
  }
  if (!expect([])) return bad(`${name} takes no arguments.`);
  return { parse: "ok", name: name as "run_examples" | "submit" };
}
