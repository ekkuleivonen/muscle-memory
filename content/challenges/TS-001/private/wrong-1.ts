// Runs of spaces collapse, but tabs and newlines still join the words around them.
/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/ +/).length;
}
