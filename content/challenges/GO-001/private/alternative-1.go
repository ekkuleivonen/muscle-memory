package composer

import "unicode"

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	words := 0
	inWord := false
	for _, r := range text {
		if unicode.IsSpace(r) {
			inWord = false
		} else if !inWord {
			// The first character after whitespace (or the start) begins a word.
			inWord = true
			words++
		}
	}
	return words
}
