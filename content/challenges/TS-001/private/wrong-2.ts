// Splitting on whitespace runs without dropping empties: leading or trailing whitespace adds a word.
/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  return text.split(/\s+/).length;
}
