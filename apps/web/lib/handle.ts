/**
 * Anonymous handles, handed out the way Reddit does: Adjective-Noun-1234. Nobody picks one, so
 * a handle says nothing about who is behind it. Mocked in the browser until accounts exist.
 */

const ADJECTIVES = [
  "Quiet",
  "Brave",
  "Lazy",
  "Curious",
  "Patient",
  "Nimble",
  "Sleepy",
  "Stubborn",
  "Gentle",
  "Clever",
  "Rusty",
  "Shiny",
  "Humble",
  "Restless",
  "Careful",
  "Lucky",
  "Mellow",
  "Swift",
  "Tidy",
  "Witty",
  "Cosmic",
  "Frosty",
  "Sunny",
  "Bold",
] as const;

const NOUNS = [
  "Compiler",
  "Semicolon",
  "Pointer",
  "Lambda",
  "Commit",
  "Rebase",
  "Linter",
  "Socket",
  "Thread",
  "Mutex",
  "Cursor",
  "Kernel",
  "Closure",
  "Iterator",
  "Bitfield",
  "Daemon",
  "Packet",
  "Buffer",
  "Hashmap",
  "Monad",
  "Pipeline",
  "Regex",
  "Tuple",
  "Vector",
] as const;

export const HANDLE_PATTERN = /^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/;

/** `random` returns integers below its argument; crypto-backed in the browser. */
export function makeHandle(random: (below: number) => number): string {
  const adjective = ADJECTIVES[random(ADJECTIVES.length)];
  const noun = NOUNS[random(NOUNS.length)];
  const number = String(random(10000)).padStart(4, "0");
  return `${adjective}-${noun}-${number}`;
}

export function randomHandle(): string {
  return makeHandle((below) => {
    const [value] = crypto.getRandomValues(new Uint32Array(1));
    return value % below;
  });
}
