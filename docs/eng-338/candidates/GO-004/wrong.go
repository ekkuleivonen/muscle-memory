package config

import (
 "errors"
 "strconv"
)

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
 invalid := errors.New("invalid duration")
 if text == "" { return 0, invalid }
 total, last := 0, -1
 maxInt := int(^uint(0) >> 1)
 for i := 0; i < len(text); {
  start := i
  for i < len(text) && text[i] >= '0' && text[i] <= '9' { i++ }
  if start == i || i == len(text) { return 0, invalid }
  n, err := strconv.Atoi(text[start:i])
  if err != nil { return 0, invalid }
  rank, multiplier := -1, 0
  switch text[i] {
  case 'h': rank, multiplier = 0, 3600
  case 'm': rank, multiplier = 1, 60
  case 's': rank, multiplier = 2, 1
  default: return 0, invalid
  }
  if rank < last || n > (maxInt-total)/multiplier { return 0, invalid }
  total += n * multiplier
  last = rank
  i++
 }
 return total, nil
}
