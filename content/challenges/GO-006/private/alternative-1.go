package metrics

import "math"

// Percentile returns the nearest-rank percentile of the samples: sort them and
// take the value at rank ceil(p / 100 × n), counting from 1. ok is false when
// there are no samples.
func Percentile(samples []int, p float64) (value int, ok bool) {
	if len(samples) == 0 {
		return 0, false
	}
	rank := int(math.Ceil(p * float64(len(samples)) / 100))
	if rank < 1 {
		rank = 1
	}
	// Without sorting: the answer is the smallest sample with at least rank samples at or below it.
	found := false
	for _, candidate := range samples {
		atOrBelow := 0
		for _, s := range samples {
			if s <= candidate {
				atOrBelow++
			}
		}
		if atOrBelow >= rank && (!found || candidate < value) {
			value, found = candidate, true
		}
	}
	return value, true
}
