import type { SeedIssue } from "../seed";
import { mateo, priya, sam } from "../team";

// ---------------------------------------------------------------------------------------------
// EDGE-5: IPv6 Host headers (C)

const HOST_FILE = "src/normalize_host.c";

const HOST_STARTER = String.raw`/*
 * normalize_host.c: the Host header as vhost routing and the cache key see it.
 *
 * Called once per request, before routing, on the raw header value. It writes into the
 * caller's buffer (the connection's scratch arena), so it never allocates.
 */
#include <stddef.h>
#include <string.h>

static char lower(char c)
{
    return (c >= 'A' && c <= 'Z') ? (char)(c - 'A' + 'a') : c;
}

/*
 * Writes the normalized host into out (size bytes, terminator included) and returns its
 * length, or -1 when the value is not a host. See docs/vhosts.md for the rules.
 */
int normalize_host(const char *host, char *out, size_t size)
{
    size_t len = strlen(host);
    const char *colon = strchr(host, ':');
    if (colon)
        len = (size_t)(colon - host);
    if (len > 0 && host[len - 1] == '.')
        len--;
    if (len == 0 || len + 1 > size)
        return -1;
    for (size_t i = 0; i < len; i++)
        out[i] = lower(host[i]);
    out[len] = '\0';
    return (int)len;
}
`;

const HOST_REFERENCE = String.raw`/*
 * normalize_host.c: the Host header as vhost routing and the cache key see it.
 *
 * Called once per request, before routing, on the raw header value. It writes into the
 * caller's buffer (the connection's scratch arena), so it never allocates.
 */
#include <stddef.h>
#include <string.h>

static char lower(char c)
{
    return (c >= 'A' && c <= 'Z') ? (char)(c - 'A' + 'a') : c;
}

/*
 * How much of the value is the host: an IPv6 literal up to and including its closing
 * bracket, anything else up to the port. -1 when a literal is never closed or is followed
 * by something other than a port.
 */
static long host_length(const char *host)
{
    if (host[0] != '[') {
        const char *colon = strchr(host, ':');
        return colon ? (long)(colon - host) : (long)strlen(host);
    }
    const char *close = strchr(host, ']');
    if (!close || (close[1] != '\0' && close[1] != ':'))
        return -1;
    return (long)(close - host) + 1;
}

/*
 * Writes the normalized host into out (size bytes, terminator included) and returns its
 * length, or -1 when the value is not a host. See docs/vhosts.md for the rules.
 */
int normalize_host(const char *host, char *out, size_t size)
{
    long len = host_length(host);
    if (len < 0)
        return -1;
    if (len > 0 && host[len - 1] == '.')
        len--;
    if (len == 0 || (size_t)len + 1 > size)
        return -1;
    for (long i = 0; i < len; i++)
        out[i] = lower(host[i]);
    out[len] = '\0';
    return (int)len;
}
`;

/** The reference, copying the host into a heap buffer first: what the review stops. */
const HOST_WITH_MALLOC = HOST_REFERENCE.replace(
  "#include <string.h>\n",
  "#include <stdlib.h>\n#include <string.h>\n",
).replace(
  "    for (long i = 0; i < len; i++)\n        out[i] = lower(host[i]);\n",
  "    char *copy = strndup(host, (size_t)len);\n    for (long i = 0; i < len; i++)\n        out[i] = lower(copy[i]);\n    free(copy);\n",
);

/** The whole fix inline in one function, nested a level deeper than it needs to be. */
const HOST_ONE_FUNCTION = HOST_STARTER.replace(
  `    size_t len = strlen(host);
    const char *colon = strchr(host, ':');
    if (colon)
        len = (size_t)(colon - host);
    if (len > 0 && host[len - 1] == '.')
        len--;`,
  `    size_t len = strlen(host);
    if (host[0] == '[') {
        const char *close = strchr(host, ']');
        if (!close || (close[1] != '\0' && close[1] != ':')) {
            return -1;
        }
        len = (size_t)(close - host) + 1;
    } else {
        const char *colon = strchr(host, ':');
        if (colon)
            len = (size_t)(colon - host);
        if (len > 0 && host[len - 1] == '.')
            len--;
    }`,
);

const VHOSTS_DOC = `# Virtual hosts

Each request is routed on its Host header after \`normalize_host\` (src/normalize_host.c) has
normalized it. The cache key uses the same value, so two spellings of one host share entries.

## Normalizing

- Lowercase: \`Shop.Example.COM\` → \`shop.example.com\`.
- No port: \`shop.example.com:8443\` → \`shop.example.com\`.
- No trailing dot: \`shop.example.com.\` → \`shop.example.com\`.
- An IPv6 literal keeps its brackets and loses only the port after them:
  \`[2001:db8::1]:8080\` → \`[2001:db8::1]\`. A literal that is never closed, or is followed by
  anything other than a port, is not a host.
- A value with nothing left is not a host.

Anything that is not a host gets the default vhost's 421.

## Config (edge.conf, excerpt)

\`\`\`text
vhost shop.example.com   { upstream shop; }
vhost cdn.example.com    { upstream static; }
vhost [2001:db8::1]      { upstream shop; }    # v6 listener, health checks
default                  { return 421; }
\`\`\`
`;

const ipv6HostHeader: SeedIssue = {
  id: "ipv6-host-header",
  title: "IPv6 requests get 421 Misdirected Request",
  summary: "Host headers with an IPv6 literal lose everything after the first colon.",
  kind: "bug",
  difficulty: "easy",
  language: "c",
  skills: ["strings", "parsing", "http"],
  task: `Since the IPv6 listener went live on Tuesday, every request that addresses the proxy by its v6 literal gets the default vhost's **421 Misdirected Request**. The health checker on \`[2001:db8::1]:8080\` has been red since; on-call silenced it at 02:10.

\`\`\`text
421 GET http://[2001:db8::1]:8080/healthz host="[2001" vhost=default
421 GET http://[2001:db8::1]/healthz      host="["     vhost=default
\`\`\`

\`normalize_host(host, out, size)\` in \`src/normalize_host.c\` turns a Host header into the name routing and the cache key use. It writes it to \`out\` and returns its length, or \`-1\` when the value is not a host (\`null\` in the checks). The rules are in \`docs/vhosts.md\`: lowercase, no port, no trailing dot, and an IPv6 literal keeps its brackets and loses only the port after them. A literal that is never closed, or is followed by anything other than a port, is not a host. Plain hostnames already work and must keep working.`,
  entrypoint: "normalize_host",
  starter: HOST_STARTER,
  parameters: ["host"],
  adapter: String.raw`#include <stdlib.h>
#include <string.h>
#include "mm_json.h"

int normalize_host(const char *host, char *out, size_t size);

/* [host] → the normalized host, or null when the value is not a host. */
mm_value *mm_call(const mm_value *args) {
    const char *host = mm_string(mm_at(args, 0));
    size_t size = strlen(host) + 1;
    char *out = calloc(size, 1);
    int len = normalize_host(host, out, size);
    mm_value *result = len < 0 ? mm_new_null() : mm_new_string(out);
    free(out);
    return result;
}
`,
  files: [{ path: "docs/vhosts.md", role: "docs", language: "markdown", text: VHOSTS_DOC }],
  inputs: [
    ["Example.COM"],
    ["example.com:8443"],
    ["[2001:db8::1]:8080"],
    ["cdn.example.com."],
    ["[::1]"],
    [""],
    [":8080"],
    ["[2001:DB8::A]:443"],
    ["[::1"],
    ["[::1]x"],
    ["EXAMPLE.com.:443"],
    ["localhost"],
    ["[::ffff:192.0.2.1]"],
    ["."],
    ["[::ffff:192.0.2.1]:443"],
    ["Shop.Example.com:80"],
  ],
  expected: [
    "example.com",
    "example.com",
    "[2001:db8::1]",
    "cdn.example.com",
    "[::1]",
    null,
    null,
    "[2001:db8::a]",
    null,
    null,
    "example.com",
    "localhost",
    "[::ffff:192.0.2.1]",
    null,
    "[::ffff:192.0.2.1]",
    "shop.example.com",
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  comments: [
    sam(
      "About 3% of requests on the v6 listener, nearly all health checks, so it's not on fire. But I'd like the alert back before the weekend.",
    ),
  ],
  hints: [
    {
      text: "Where does the host end and the port begin when the host itself is full of colons?",
      when: { behaviour: "active-minutes-without-progress", atLeast: 8 },
    },
    {
      text: "For a bracketed literal, the closing bracket marks the end of the host; whatever follows it can only be a port.",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "sam-no-malloc",
      author: "Sam R",
      role: "SRE",
      where: "review",
      severity: "blocking",
      text: [
        "This runs on every request before routing. Can we keep allocation out of it? `out` is already the buffer to write into.",
        "No heap on the request path, please: this is called for every request and `out` is already sized for the result.",
      ],
      when: {
        pattern: "\\b(malloc|calloc|realloc|strdup|strndup)\\s*\\(",
        present: true,
        file: HOST_FILE,
      },
      repeat: "while-true",
    },
    {
      id: "sam-nesting",
      author: "Sam R",
      role: "SRE",
      where: "review",
      severity: "nit",
      text: [
        "Nit: `normalize_host` now has two ways of finding the end of the host inline. A small helper for that would keep the function readable at 3am.",
      ],
      when: { metric: "nesting", above: 2, file: HOST_FILE },
    },
    {
      id: "sam-healthz",
      author: "Sam R",
      role: "SRE",
      where: "review",
      severity: "info",
      text: ["That's the health checker's Host header. I'll unsilence the alert once this is out."],
      when: { check: "case-3", is: "passing" },
    },
  ],
  private: {
    reference: { [HOST_FILE]: HOST_REFERENCE },
    examples: {
      "sam-no-malloc": {
        fires: [{ [HOST_FILE]: HOST_WITH_MALLOC }],
        quiet: [{ [HOST_FILE]: HOST_REFERENCE }, { [HOST_FILE]: HOST_ONE_FUNCTION }],
      },
      "sam-nesting": {
        fires: [{ [HOST_FILE]: HOST_ONE_FUNCTION }],
        quiet: [{ [HOST_FILE]: HOST_REFERENCE }],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// EDGE-6: weighted upstreams (Go)

const BALANCER_FILE = "pick_order.go";

const BALANCER_STARTER = `// Package balancer picks the upstream server for each request. Servers and
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
`;

const BALANCER_REFERENCE = `// Package balancer picks the upstream server for each request. Servers and
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
// nginx does it; see docs/weighted-balancing.md). A config reload builds a new
// one; Next is called from every connection's goroutine.
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
`;

const BALANCER_UNLOCKED = BALANCER_REFERENCE.replace(
  "\tr.mu.Lock()\n\tdefer r.mu.Unlock()\n",
  "",
);

const BALANCER_LONG = BALANCER_REFERENCE.replace(
  "\tif best < 0 {\n\t\treturn \"\", false\n\t}\n",
  `\tif best < 0 {
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
`,
);

const WEIGHTED_DOC = `# Weighted balancing

Status: agreed, for the origin-v2 canary. Owner: Mateo.

\`server <name> weight=<n>;\` gives a server n shares of an upstream's requests. \`weight=0\`
drains it: it keeps its place in the block but gets no requests. An upstream whose servers
are all drained has nowhere to send a request.

## Smooth, not bursty

With 5:1:1 a naive scheme sends five requests in a row to the first server. We do what nginx
does instead, so the small server's requests are spread out:

1. Every server starts with a current value of 0.
2. For each request, add each server's weight to its current value.
3. Pick the server with the highest current value; on a tie, the one listed first.
4. Subtract the total weight of all servers that took part from the picked server's value.

Drained servers take part in nothing: their weight is not added and does not count towards
the total.

## Worked example: a=5, b=1, c=1

| Request | After adding weights (a, b, c) | Picked | After subtracting 7 |
|---|---|---|---|
| 1 | 5, 1, 1 | a | -2, 1, 1 |
| 2 | 3, 2, 2 | a | -4, 2, 2 |
| 3 | 1, 3, 3 | b | 1, -4, 3 |
| 4 | 6, -3, 4 | a | -1, -3, 4 |
| 5 | 4, -2, 5 | c | 4, -2, -2 |
| 6 | 9, -1, -1 | a | 2, -1, -1 |
| 7 | 7, 0, 0 | a | 0, 0, 0 |

After seven requests every value is back at 0 and the cycle repeats: a a b a c a a.
`;

const weightedUpstreams: SeedIssue = {
  id: "weighted-upstreams",
  title: "Upstream weights are ignored",
  summary: "The balancer round-robins evenly, so the 10% canary would get half the traffic.",
  kind: "feature",
  difficulty: "medium",
  language: "go",
  skills: ["load-balancing", "concurrency", "algorithms"],
  task: `We want to start the origin-v2 canary on Monday at 10% of traffic. The upstream block already says so:

\`\`\`text
upstream origin {
    server origin-v1 weight=9;
    server origin-v2 weight=1;
}
\`\`\`

but the balancer never looks at weights. In staging last night origin-v2 got **10,041 of 20,000** requests (50.2%).

\`PickOrder(backends, n)\` in \`pick_order.go\` returns where the next \`n\` requests go on a freshly loaded upstream; the proxy itself calls \`RoundRobin.Next\` once per request. Make the balancer honour weights the way \`docs/weighted-balancing.md\` describes: smooth, so origin-v2 gets one request in ten spread out rather than in a burst, ties to the server listed first, and \`weight=0\` drains a server. With no servers, or every server drained, there are no picks.`,
  entrypoint: "PickOrder",
  starter: BALANCER_STARTER,
  parameters: ["backends", "n"],
  files: [
    { path: "docs/weighted-balancing.md", role: "docs", language: "markdown", text: WEIGHTED_DOC },
  ],
  inputs: [
    [[{ name: "a", weight: 1 }, { name: "b", weight: 1 }, { name: "c", weight: 1 }], 6],
    [[{ name: "a", weight: 5 }, { name: "b", weight: 1 }, { name: "c", weight: 1 }], 7],
    [[{ name: "origin-v1", weight: 9 }, { name: "origin-v2", weight: 1 }], 10],
    [[{ name: "a", weight: 2 }, { name: "b", weight: 0 }, { name: "c", weight: 1 }], 6],
    [[], 3],
    [[{ name: "a", weight: 0 }, { name: "b", weight: 0 }], 4],
    [[{ name: "a", weight: 1 }], 0],
    [[{ name: "a", weight: 3 }], 3],
    [[{ name: "a", weight: 2 }, { name: "b", weight: 2 }], 4],
    [[{ name: "a", weight: 5 }, { name: "b", weight: 1 }, { name: "c", weight: 1 }], 14],
    [[{ name: "a", weight: 3 }, { name: "b", weight: 2 }], 5],
    [[{ name: "a", weight: 1 }, { name: "b", weight: 2 }, { name: "c", weight: 3 }], 12],
    [[{ name: "a", weight: 0 }, { name: "b", weight: 1 }, { name: "c", weight: 1 }], 4],
    [[{ name: "a", weight: 1 }, { name: "b", weight: 9 }], 10],
    [
      [
        { name: "a", weight: 4 },
        { name: "b", weight: 3 },
        { name: "c", weight: 2 },
        { name: "d", weight: 1 },
      ],
      10,
    ],
    [[{ name: "a", weight: 100 }, { name: "b", weight: 1 }], 5],
  ],
  expected: [
    ["a", "b", "c", "a", "b", "c"],
    ["a", "a", "b", "a", "c", "a", "a"],
    [
      "origin-v1",
      "origin-v1",
      "origin-v1",
      "origin-v1",
      "origin-v1",
      "origin-v2",
      "origin-v1",
      "origin-v1",
      "origin-v1",
      "origin-v1",
    ],
    ["a", "c", "a", "a", "c", "a"],
    [],
    [],
    [],
    ["a", "a", "a"],
    ["a", "b", "a", "b"],
    ["a", "a", "b", "a", "c", "a", "a", "a", "a", "b", "a", "c", "a", "a"],
    ["a", "b", "a", "b", "a"],
    ["c", "b", "a", "c", "b", "c", "c", "b", "a", "c", "b", "c"],
    ["b", "c", "b", "c"],
    ["b", "b", "b", "b", "a", "b", "b", "b", "b", "b"],
    ["a", "b", "c", "a", "b", "d", "a", "c", "b", "a"],
    ["a", "a", "a", "a", "a"],
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  comments: [
    mateo(
      "Weights are parsed into `Backend.Weight` already; config isn't the problem. I'd like `edgectl upstream preview` to show the real order before we flip the canary on.",
    ),
    sam("If origin-v2 misbehaves I'll drain it with weight=0 rather than editing the block, so that has to work too."),
  ],
  hints: [
    {
      text: "Plain round robin only remembers whose turn it is. With weights, each server also has to remember how far ahead of or behind its share it is.",
      when: { behaviour: "active-minutes-without-progress", atLeast: 12 },
    },
    {
      text: "Walk the 5:1:1 table in the design note against your code one request at a time. A drained server should play no part in any of the sums.",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "mateo-keep-lock",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "`Next` runs on every connection's goroutine, and now it reads and writes the counters on each call. Without the lock two requests race on them. Can we keep it?",
        "The lock went missing from `Next`. Every connection goroutine calls it and it updates shared counters, so the race detector will flag this on the first load test.",
      ],
      when: { pattern: "\\.Lock\\(\\)", present: false, file: BALANCER_FILE },
      repeat: "while-true",
    },
    {
      id: "mateo-long-next",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "nit",
      text: ["Nit: `Next` is getting long for something on the request path. Is all of it needed?"],
      when: { metric: "function-lines", above: 26, file: BALANCER_FILE },
    },
    {
      id: "sam-canary",
      author: "Sam R",
      role: "SRE",
      where: "review",
      severity: "info",
      text: ["That's the 9:1 we want. I'll roll it to one PoP first and watch origin-v2's error rate."],
      when: { check: "case-3", is: "passing" },
    },
  ],
  private: {
    reference: { [BALANCER_FILE]: BALANCER_REFERENCE },
    examples: {
      "mateo-keep-lock": {
        fires: [{ [BALANCER_FILE]: BALANCER_UNLOCKED }],
        quiet: [{ [BALANCER_FILE]: BALANCER_REFERENCE }, { [BALANCER_FILE]: BALANCER_LONG }],
      },
      "mateo-long-next": {
        fires: [{ [BALANCER_FILE]: BALANCER_LONG }],
        quiet: [{ [BALANCER_FILE]: BALANCER_REFERENCE }],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// EDGE-7: the cache index after #412 (C++), a teammate's change to judge

const INDEX_FILE = "src/cache_index.cpp";

const INDEX_STARTER = String.raw`// cache_index.cpp: the response cache's index, from a request's key to the slot that holds
// its response in the arena.
//
// Open addressing with linear probing over a fixed array of slots, sized once at startup from
// cache.index_slots. This replaced the std::unordered_map index on Thursday (#412): that
// allocated a node on every insert, about 9% of CPU on the edge flame graphs at peak.
#include <cstddef>
#include <string>
#include <vector>

namespace {

class CacheIndex {
  public:
    explicit CacheIndex(std::size_t slots) : slots_(slots) {}

    // Stores value under key. False when every slot is taken: the response is then served
    // without being cached.
    bool put(int key, int value) {
        if (slots_.empty()) return false;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state == State::Empty) {
                slot = Slot{State::Full, key, value};
                return true;
            }
            if (slot.key == key) {
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        return false;
    }

    // The value stored under key, or -1 on a miss.
    int get(int key) const {
        const Slot *slot = find(key);
        return slot ? slot->value : -1;
    }

    // Purges key, if it is there.
    void erase(int key) {
        Slot *slot = const_cast<Slot *>(find(key));
        if (slot) *slot = Slot{};
    }

  private:
    enum class State : unsigned char { Empty, Full };
    struct Slot {
        State state = State::Empty;
        int key = 0;
        int value = 0;
    };

    // Keys are already hashes of the request (method, host, path, Vary headers).
    std::size_t home(int key) const { return static_cast<unsigned>(key) % slots_.size(); }
    std::size_t next(std::size_t i) const { return (i + 1) % slots_.size(); }

    const Slot *find(int key) const {
        if (slots_.empty()) return nullptr;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            const Slot &slot = slots_[i];
            if (slot.state == State::Empty) return nullptr;
            if (slot.key == key) return &slot;
            i = next(i);
        }
        return nullptr;
    }

    std::vector<Slot> slots_;
};

}  // namespace

// One line of a cache log: {"put", key, value}, {"get", key} or {"erase", key}.
struct Op {
    std::string name;
    int key;
    int value;
};

// Replays a cache log against an index with the given number of slots and returns what each
// get found, -1 for a miss. edgectl cache replay and the tests use it.
std::vector<int> cache_index(int slots, const std::vector<Op>& ops) {
    CacheIndex index(static_cast<std::size_t>(slots));
    std::vector<int> found;
    for (const Op &op : ops) {
        if (op.name == "put")
            index.put(op.key, op.value);
        else if (op.name == "erase")
            index.erase(op.key);
        else if (op.name == "get")
            found.push_back(index.get(op.key));
    }
    return found;
}
`;

const INDEX_REFERENCE = INDEX_STARTER.replace(
  `        if (slots_.empty()) return false;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state == State::Empty) {
                slot = Slot{State::Full, key, value};
                return true;
            }
            if (slot.key == key) {
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        return false;`,
  `        if (slots_.empty()) return false;
        Slot *free = nullptr;
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state == State::Empty) {
                if (!free) free = &slot;
                break;
            }
            if (slot.state == State::Purged) {
                // Reusable, but the key may still be further along the chain.
                if (!free) free = &slot;
            } else if (slot.key == key) {
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        if (!free) return false;
        *free = Slot{State::Full, key, value};
        return true;`,
)
  .replace(
    `    // Purges key, if it is there.
    void erase(int key) {
        Slot *slot = const_cast<Slot *>(find(key));
        if (slot) *slot = Slot{};
    }`,
    `    // Purges key, if it is there. The slot stays marked rather than empty, so keys that
    // probed past it are still found.
    void erase(int key) {
        Slot *slot = const_cast<Slot *>(find(key));
        if (slot) slot->state = State::Purged;
    }`,
  )
  .replace(
    "enum class State : unsigned char { Empty, Full };",
    "enum class State : unsigned char { Empty, Full, Purged };",
  )
  .replace(
    "            if (slot.key == key) return &slot;",
    "            if (slot.state == State::Full && slot.key == key) return &slot;",
  );

/** Going back to a node-based map: passes every case, undoes the point of #412. */
const INDEX_NODE_MAP = INDEX_REFERENCE.replace(
  "#include <string>\n",
  "#include <string>\n#include <unordered_map>\n",
).replace(
  "    std::vector<Slot> slots_;\n",
  "    std::vector<Slot> slots_;\n    std::unordered_map<int, int> overflow_;\n",
);

/** The same fix as two passes over the chain: correct, and twice the length. */
const INDEX_TWO_PASS = INDEX_REFERENCE.replace(
  INDEX_REFERENCE.slice(
    INDEX_REFERENCE.indexOf("    bool put(int key, int value) {"),
    INDEX_REFERENCE.indexOf("    // The value stored under key"),
  ),
  `    bool put(int key, int value) {
        if (slots_.empty()) return false;
        // First pass: if the key is stored, update it in place.
        std::size_t i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state == State::Empty) {
                break;
            }
            if (slot.state == State::Full && slot.key == key) {
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        // Second pass: take the first slot that is empty or purged.
        i = home(key);
        for (std::size_t probes = 0; probes < slots_.size(); probes++) {
            Slot &slot = slots_[i];
            if (slot.state != State::Full) {
                slot.state = State::Full;
                slot.key = key;
                slot.value = value;
                return true;
            }
            i = next(i);
        }
        return false;
    }

`,
);

const INDEX_DOC = `# #412: open-addressing cache index

Author: Mateo O. Merged Thursday, deployed to every PoP by 14:00.

## Why

The response cache's index was a \`std::unordered_map<int, int>\`: one heap node per insert. At
peak that was 9% of CPU on the edge flame graphs, most of it in \`operator new\` and \`free\`.

## What

A flat array of \`cache.index_slots\` slots, allocated once at startup. A key's home slot is
\`key % slots\`; on a collision, the next slot, wrapping around at the end (linear probing).
A lookup walks from the home slot until it finds the key or reaches an empty slot. When every
slot holds an entry, a new response is served without being cached.

## Results (canary PoP, 24 h)

- CPU at peak: -9.2%
- p99 time to first byte: 3.1 ms → 2.6 ms
- Allocations per request on the cache path: 1 → 0
`;

const cacheIndexPurge: SeedIssue = {
  id: "cache-index-purge",
  title: "Cache hit ratio fell to 71% after the index change",
  summary: "Since #412, keys stored past a purged slot are reported as misses.",
  kind: "bug",
  difficulty: "hard",
  language: "cpp",
  skills: ["hash-tables", "caching", "reviewing-changes"],
  task: `Mateo replaced the response cache's \`std::unordered_map\` index with an open-addressing table on Thursday (#412, notes in \`docs/412-cache-index.md\`) to take the per-insert allocation off the hot path. CPU at peak is down 9%, but since the deploy:

- the cache hit ratio went from **94.1%** to **71.3%**, worst on the PoPs that purge the most;
- origin requests are up **3.2×**;
- \`edgectl cache get\` reports misses for keys whose responses are visibly in the arena.

\`\`\`text
14:02:11 purge key=3                        ok
14:02:19 get   key=11  miss                 (arena slot 4: key=11, age 41s)
14:02:19 get   key=19  miss                 (arena slot 5: key=19, age 38s)
\`\`\`

\`cache_index(slots, ops)\` in \`src/cache_index.cpp\` replays a cache log against an index of \`slots\` slots: \`["put", key, value]\`, \`["get", key]\` and \`["erase", key]\` (a purge). It returns what each get found, \`-1\` for a miss. The index must behave like a map of at most \`slots\` entries: a get finds the latest value put under its key unless the key was purged since, and a put is refused (the response is served uncached) only when every slot holds a live entry. A purged response must never come back. Keep the flat table: going back to a node-based map is not the fix.`,
  entrypoint: "cache_index",
  starter: INDEX_STARTER,
  parameters: ["slots", "ops"],
  adapter: String.raw`#include <string>
#include <vector>
#include "mm_json.h"

struct Op {
    std::string name;
    int key;
    int value;
};
std::vector<int> cache_index(int slots, const std::vector<Op>& ops);

// [slots, [[name, key, value?], ...]] → what each get found.
mm_value *mm_call(const mm_value *args) {
    std::vector<Op> ops;
    const mm_value *list = mm_at(args, 1);
    for (size_t i = 0; i < mm_length(list); i++) {
        const mm_value *op = mm_at(list, i);
        ops.push_back({mm_string(mm_at(op, 0)), (int)mm_integer(mm_at(op, 1)),
                       (int)mm_integer(mm_at(op, 2))});
    }
    mm_value *result = mm_new_array();
    for (int got : cache_index((int)mm_integer(mm_at(args, 0)), ops))
        mm_push(result, mm_new_integer(got));
    return result;
}
`,
  files: [{ path: "docs/412-cache-index.md", role: "docs", language: "markdown", text: INDEX_DOC }],
  inputs: [
    [8, [["put", 1, 100], ["put", 2, 200], ["get", 1], ["get", 2], ["get", 3]]],
    [8, [["put", 3, 30], ["put", 11, 110], ["put", 19, 190], ["erase", 3], ["get", 11], ["get", 19], ["get", 3]]],
    [8, [["put", 5, 50], ["put", 5, 55], ["get", 5], ["erase", 5], ["get", 5], ["erase", 5], ["get", 5]]],
    [2, [["put", 0, 1], ["put", 1, 2], ["put", 2, 3], ["get", 2], ["erase", 0], ["put", 2, 3], ["get", 2], ["get", 1]]],
    [4, [["put", 3, 30], ["put", 7, 70], ["put", 11, 110], ["erase", 7], ["get", 11], ["get", 3], ["get", 7]]],
    [8, [["put", 2, 20], ["put", 10, 100], ["erase", 2], ["put", 10, 101], ["get", 10], ["erase", 10], ["get", 10]]],
    [2, [["put", 0, 1], ["put", 2, 2], ["erase", 0], ["erase", 2], ["put", 4, 4], ["get", 4], ["get", 0], ["get", 2]]],
    [0, [["put", 1, 1], ["get", 1], ["erase", 1], ["get", 1]]],
    [1, [["put", 4, 40], ["get", 4], ["put", 5, 50], ["get", 5], ["erase", 4], ["put", 5, 50], ["get", 5], ["get", 4]]],
    [4, [["put", 1, 10], ["put", 5, 50], ["put", 9, 90], ["erase", 5], ["erase", 1], ["get", 9], ["put", 13, 130], ["get", 13], ["get", 9]]],
    [4, [["put", 0, 1], ["put", 4, 2], ["put", 8, 3], ["put", 12, 4], ["erase", 4], ["erase", 8], ["put", 12, 5], ["get", 12], ["erase", 12], ["get", 12], ["get", 0]]],
    [8, [["erase", 3], ["get", 3], ["put", 3, 1], ["erase", 3], ["erase", 3], ["get", 3], ["put", 3, 2], ["get", 3]]],
    [4, [["put", 2, 20], ["put", 6, 60], ["erase", 2], ["put", 2, 21], ["get", 2], ["get", 6], ["erase", 6], ["get", 2]]],
    [3, [["put", 0, 1], ["put", 3, 2], ["put", 6, 3], ["put", 9, 4], ["get", 9], ["erase", 3], ["put", 9, 4], ["get", 9], ["get", 6], ["get", 0]]],
    [8, [["put", 4, 40], ["put", 12, 120], ["put", 20, 200], ["erase", 12], ["put", 20, 201], ["erase", 20], ["get", 20], ["get", 4]]],
    [5, [["put", 7, 70], ["put", 12, 120], ["put", 17, 170], ["erase", 7], ["erase", 12], ["get", 17], ["put", 7, 71], ["get", 7], ["get", 17]]],
    [4, [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["put", 0, 4], ["erase", 2], ["put", 6, 6], ["get", 6], ["get", 3], ["get", 0], ["put", 10, 10], ["get", 10]]],
  ],
  expected: [
    [100, 200, -1],
    [110, 190, -1],
    [55, -1, -1],
    [-1, 3, 2],
    [110, 30, -1],
    [101, -1],
    [4, -1, -1],
    [-1, -1],
    [40, -1, 50, -1],
    [90, 130, 90],
    [5, -1, 1],
    [-1, -1, 2],
    [21, 60, 21],
    [-1, 4, 3, 1],
    [-1, 40],
    [170, 71, 170],
    [6, 3, 4, -1],
  ],
  hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  comments: [
    mateo(
      "That's my change. The CPU win is real and I'd rather keep the table than revert, so I'd like a fix on top of it. I tested puts and gets; I don't think I ever replayed a purge.",
    ),
    priya(
      "Hit ratio on the edge dashboard: 94.1% the week before, 71.3% since Thursday 14:00. FRA and AMS are worst, and they run the most purges.",
    ),
  ],
  hints: [
    {
      text: "Follow key 11 from the log: where does its lookup start, which slots does it pass, and where does it stop once key 3 has been purged?",
      when: { behaviour: "active-minutes-without-progress", atLeast: 15 },
    },
    {
      text: "A purged slot must stop matching its old key without ending the chain through it. And before a put takes a free slot, it has to know its key isn't stored further along.",
      when: { behaviour: "failing-pushes", atLeast: 2 },
    },
  ],
  team: [
    {
      id: "mateo-flat-table",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "This brings a heap allocation back onto the cache path, which is what #412 took out. Can we fix the probing in the flat table instead?",
        "Please keep the index allocation-free: a node-based container here puts `operator new` back on the flame graph we just cleaned up.",
      ],
      when: {
        pattern:
          "#include\\s*<(unordered_map|map|list|unordered_set|set)>|std::(unordered_map|map|list|unordered_set|set)\\s*<|\\bnew\\s+[A-Za-z_]|make_(unique|shared)\\s*<",
        present: true,
        file: INDEX_FILE,
      },
      repeat: "while-true",
    },
    {
      id: "mateo-long-put",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "nit",
      text: ["Nit: `put` is getting long for the hot path. A single walk of the chain can look for the key and remember the first free slot at the same time."],
      when: { metric: "function-lines", above: 26, file: INDEX_FILE },
    },
    {
      id: "priya-purges",
      author: "Priya K",
      role: "Data",
      where: "review",
      severity: "info",
      text: ["That's the purge from the incident log. I'll watch the FRA hit ratio after the deploy."],
      when: { check: "case-2", is: "passing" },
    },
  ],
  private: {
    reference: { [INDEX_FILE]: INDEX_REFERENCE },
    examples: {
      "mateo-flat-table": {
        fires: [{ [INDEX_FILE]: INDEX_NODE_MAP }],
        quiet: [{ [INDEX_FILE]: INDEX_REFERENCE }, { [INDEX_FILE]: INDEX_STARTER }],
      },
      "mateo-long-put": {
        fires: [{ [INDEX_FILE]: INDEX_TWO_PASS }],
        quiet: [{ [INDEX_FILE]: INDEX_REFERENCE }],
      },
    },
  },
};

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [ipv6HostHeader, weightedUpstreams, cacheIndexPurge];
