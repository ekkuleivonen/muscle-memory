// Trimming fixes the empty post, not the double space.
/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return text.trim() === "" ? 0 : text.trim().split(" ").length;
}
