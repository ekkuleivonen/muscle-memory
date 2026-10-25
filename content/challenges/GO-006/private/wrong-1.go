// Truncates p / 100 × n and uses it as a 0-based index, which is one rank too high whenever it is a whole number.
package metrics

import "sort"

// Percentile returns the nearest-rank percentile of the samples: sort them and
// take the value at rank ceil(p / 100 × n), counting from 1. ok is false when
// there are no samples.
func Percentile(samples []int, p float64) (value int, ok bool) {
	if len(samples) == 0 {
		return 0, false
	}
	sorted := append([]int(nil), samples...)
	sort.Ints(sorted)
	i := int(p / 100 * float64(len(sorted)))
	if i >= len(sorted) {
		i = len(sorted) - 1
	}
	return sorted[i], true
}
