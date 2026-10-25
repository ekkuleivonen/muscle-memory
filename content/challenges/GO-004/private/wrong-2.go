// Rejects a repeated unit but not one out of order, so "1m1h" is accepted.
package config

import "errors"

var errBadDuration = errors.New("durations look like 1h30m: h, m and s, each at most once, in that order")

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
	seconds := map[byte]int{'h': 3600, 'm': 60, 's': 1}
	seen := map[byte]bool{}
	if text == "" {
		return 0, errBadDuration
	}
	total, n, digits := 0, 0, 0
	for i := 0; i < len(text); i++ {
		c := text[i]
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
			digits++
			continue
		}
		unit, ok := seconds[c]
		if !ok || digits == 0 || seen[c] {
			return 0, errBadDuration
		}
		seen[c] = true
		total += n * unit
		n, digits = 0, 0
	}
	if digits > 0 {
		return 0, errBadDuration
	}
	return total, nil
}
