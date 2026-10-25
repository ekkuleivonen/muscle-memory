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
// nginx does it). The smooth order repeats every total-weight requests, so it
// is worked out once when the upstream is loaded and then replayed. A config
// reload builds a new one; Next is called from every connection's goroutine.
type RoundRobin struct {
	mu       sync.Mutex
	schedule []string
	next     int
}

// NewRoundRobin works out one full cycle from its own copy of the servers, so a
// reload cannot change them underneath it.
func NewRoundRobin(backends []Backend) *RoundRobin {
	total := 0
	for _, b := range backends {
		if b.Weight > 0 {
			total += b.Weight
		}
	}
	current := make([]int, len(backends))
	schedule := make([]string, 0, total)
	for len(schedule) < total {
		best := -1
		for i, b := range backends {
			if b.Weight <= 0 {
				continue
			}
			current[i] += b.Weight
			if best < 0 || current[i] > current[best] {
				best = i
			}
		}
		current[best] -= total
		schedule = append(schedule, backends[best].Name)
	}
	return &RoundRobin{schedule: schedule}
}

// Next returns the server for the next request; false when there is none,
// which is also the case when every server is drained (weight 0).
func (r *RoundRobin) Next() (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.schedule) == 0 {
		return "", false
	}
	name := r.schedule[r.next]
	r.next = (r.next + 1) % len(r.schedule)
	return name, true
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
