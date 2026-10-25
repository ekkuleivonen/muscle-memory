package config

import "errors"

var errBadDuration = errors.New("durations look like 1h30m: h, m and s, each at most once, in that order")

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
	units := []byte{'h', 'm', 's'}
	seconds := []int{3600, 60, 1}
	if text == "" {
		return 0, errBadDuration
	}
	total, unit, i := 0, 0, 0
	for i < len(text) {
		start, n := i, 0
		for i < len(text) && text[i] >= '0' && text[i] <= '9' {
			n = n*10 + int(text[i]-'0')
			i++
		}
		if i == start || i == len(text) {
			return 0, errBadDuration
		}
		for unit < len(units) && units[unit] != text[i] {
			unit++
		}
		if unit == len(units) {
			return 0, errBadDuration
		}
		total += n * seconds[unit]
		unit++
		i++
	}
	return total, nil
}
