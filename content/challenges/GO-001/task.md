`CountWords(text)` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.
