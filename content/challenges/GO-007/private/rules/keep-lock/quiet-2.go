// Package balancer picks the upstream server for each request. Servers and
// their weights come from the upstream blocks in edge.conf.
package balancer

import "sync"

// Backend is one server line in an upstream block: server origin-v1 weight=9;
type Backend struct {
	Name   string
	Weight int
}

// RoundRobin hands out the servers of one upstream in proportion to their
// weights, spread out rather than in bursts (smooth weighted round robin, as
// nginx does it). A config reload builds a new one; Next is called from every
// connection's goroutine.
type RoundRobin struct {
	mu       sync.Mutex
	backends []Backend
	// current[i] is how far ahead of its share backends[i] is owed.
	current []int
}

// NewRoundRobin keeps its own copy of the servers, so a reload cannot change
// them underneath it.
func NewRoundRobin(backends []Backend) *RoundRobin {
	return &RoundRobin{
		backends: append([]Backend(nil), backends...),
		current:  make([]int, len(backends)),
	}
}

// Next returns the server for the next request; false when there is none,
// which is also the case when every server is drained (weight 0).
func (r *RoundRobin) Next() (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	total, best := 0, -1
	for i, b := range r.backends {
		if b.Weight <= 0 {
			continue
		}
		r.current[i] += b.Weight
		total += b.Weight
		if best < 0 || r.current[i] > r.current[best] {
			best = i
		}
	}
	if best < 0 {
		return "", false
	}
	// Keep the counters small on long-lived upstreams.
	low := r.current[0]
	for _, c := range r.current {
		if c < low {
			low = c
		}
	}
	if low > 0 {
		for i := range r.current {
			r.current[i] -= low
		}
	}
	if len(r.current) == 0 {
		return "", false
	}
	r.current[best] -= total
	return r.backends[best].Name, true
}

// PickOrder returns where the next n requests go on a freshly loaded
// upstream: edgectl upstream preview prints it before a rollout.
func PickOrder(backends []Backend, n int) []string {
	r := NewRoundRobin(backends)
	picks := make([]string, 0, n)
	for i := 0; i < n; i++ {
		name, ok := r.Next()
		if !ok {
			break
		}
		picks = append(picks, name)
	}
	return picks
}
