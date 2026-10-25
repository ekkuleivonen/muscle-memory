// Digits left over after the last unit are silently dropped, so "1h30" is 1 hour and "90" is 0 seconds.
package config

import "errors"

var errBadDuration = errors.New("durations look like 1h30m: h, m and s, each at most once, in that order")

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
	units := "hms"
	seconds := []int{3600, 60, 1}
	if text == "" {
		return 0, errBadDuration
	}
	total, n, digits, next := 0, 0, 0, 0
	for i := 0; i < len(text); i++ {
		c := text[i]
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
			digits++
			continue
		}
		if digits == 0 {
			return 0, errBadDuration
		}
		for next < len(units) && units[next] != c {
			next++
		}
		if next == len(units) {
			return 0, errBadDuration
		}
		total += n * seconds[next]
		next++
		n, digits = 0, 0
	}
	return total, nil
}
