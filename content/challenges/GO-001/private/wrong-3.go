// Counts runs of letters and digits, so punctuation and symbols split words or vanish instead of belonging to them.
package composer

import (
	"strings"
	"unicode"
)

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	return len(strings.FieldsFunc(text, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}))
}
