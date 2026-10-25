// \w only matches ASCII letters, digits and _: apostrophes, accents and lone symbols split or drop words.
/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  return (text.match(/\w+/g) ?? []).length;
}
