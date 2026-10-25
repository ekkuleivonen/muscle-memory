/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  let words = 0;
  let inWord = false;
  for (const char of text) {
    const blank = char.trim() === "";
    if (!blank && !inWord) words++;
    inWord = !blank;
  }
  return words;
}
