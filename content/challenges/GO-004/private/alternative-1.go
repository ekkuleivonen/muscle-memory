package config

import (
	"errors"
	"regexp"
	"strconv"
)

var errBadDuration = errors.New("durations look like 1h30m: h, m and s, each at most once, in that order")

// Each part is optional, but the order is fixed; an empty match is still an error.
var durationPattern = regexp.MustCompile(`^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$`)

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
	m := durationPattern.FindStringSubmatch(text)
	if text == "" || m == nil {
		return 0, errBadDuration
	}
	total := 0
	for i, unit := range []int{3600, 60, 1} {
		if m[i+1] == "" {
			continue
		}
		n, err := strconv.Atoi(m[i+1])
		if err != nil {
			return 0, errBadDuration
		}
		total += n * unit
	}
	return total, nil
}
