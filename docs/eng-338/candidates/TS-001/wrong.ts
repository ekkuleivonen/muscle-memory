/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  return text.split(/ +/).filter(Boolean).length;
}
