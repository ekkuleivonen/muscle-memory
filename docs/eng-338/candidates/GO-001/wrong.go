package composer

import "strings"

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	text = strings.TrimSpace(text)
	if text == "" { return 0 }
	return len(strings.Split(text, " "))
}
