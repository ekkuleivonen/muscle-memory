// Uses the rank as a 0-based index, forgetting that ranks count from 1.
package metrics

import (
	"math"
	"sort"
)

// Percentile returns the nearest-rank percentile of the samples: sort them and
// take the value at rank ceil(p / 100 × n), counting from 1. ok is false when
// there are no samples.
func Percentile(samples []int, p float64) (value int, ok bool) {
	if len(samples) == 0 {
		return 0, false
	}
	sorted := append([]int(nil), samples...)
	sort.Ints(sorted)
	rank := int(math.Ceil(p / 100 * float64(len(sorted))))
	if rank > len(sorted)-1 {
		rank = len(sorted) - 1
	}
	return sorted[rank], true
}
