package composer

import "strings"

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	return strings.Count(text, " ") + 1
}
