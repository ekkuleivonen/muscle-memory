// Splits on spaces only, so tabs and newlines don't separate words.
package composer

import "strings"

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	words := 0
	for _, part := range strings.Split(text, " ") {
		if part != "" {
			words++
		}
	}
	return words
}
