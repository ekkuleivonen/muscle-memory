package metrics

import (
 "sort"
 "math"
)

// Percentile returns the nearest-rank percentile of the samples: sort them and
// take the value at rank ceil(p / 100 × n), counting from 1. ok is false when
// there are no samples.
func Percentile(samples []int, p float64) (value int, ok bool) {
 sorted := append([]int(nil), samples...)
 sort.Ints(sorted)
 if len(sorted) == 0 { return 0, false }
 rank := int(math.Ceil(p / 100 * float64(len(sorted))))
 return sorted[rank-1], true
}
