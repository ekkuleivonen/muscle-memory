// Package balancer picks the upstream server for each request. Servers and
// their weights come from the upstream blocks in edge.conf.
package balancer

import "sync"

// Backend is one server line in an upstream block: server origin-v1 weight=9;
type Backend struct {
	Name   string
	Weight int
}

// RoundRobin hands out the servers of one upstream in turn. A config reload
// builds a new one; Next is called from every connection's goroutine.
type RoundRobin struct {
	mu       sync.Mutex
	backends []Backend
	next     int
}

// NewRoundRobin keeps its own copy of the servers, so a reload cannot change
// them underneath it.
func NewRoundRobin(backends []Backend) *RoundRobin {
	return &RoundRobin{backends: append([]Backend(nil), backends...)}
}

// Next returns the server for the next request; false when there is none.
func (r *RoundRobin) Next() (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.backends) == 0 {
		return "", false
	}
	b := r.backends[r.next]
	r.next = (r.next + 1) % len(r.backends)
	return b.Name, true
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
