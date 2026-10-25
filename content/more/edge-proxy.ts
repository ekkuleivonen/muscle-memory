import type { SeedIssue } from "../seed";
import { mateo, priya, sam } from "../team";

// ---------------------------------------------------------------------------------------------
// C-001: IPv6 Host headers (C)

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
 * length, or -1 when the value is not a host.
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
 * length, or -1 when the value is not a host.
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

const ipv6HostHeader: SeedIssue = {
  id: "ipv6-host-header",
  key: "C-001",
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

The proxy routes each request on its Host header after \`normalize_host\` has normalized it, and the response cache keys on the same value, so two spellings of one host share a vhost and cache entries. Plain hostnames already work; IPv6 literals do not, because the current code treats the first \`:\` as the start of the port.

## What to write

\`int normalize_host(const char *host, char *out, size_t size)\`

- \`host\` is the raw Host header value, a NUL-terminated string.
- Write the normalized host into \`out\`, NUL-terminated, and return its length (not counting the terminator).
- \`size\` is the size of \`out\` in bytes, terminator included. If the result plus its terminator does not fit, return \`-1\`.
- Return \`-1\` when the value is not a host. The examples show \`-1\` as \`null\`, and a string for a host.

## Normalizing rules

- **Port:** remove the port. For a hostname, the port is everything from the first \`:\` on (\`example.com:8443\` becomes \`example.com\`).
- **IPv6 literals:** a value starting with \`[\` is an IPv6 literal. It keeps its brackets and loses only a port after the closing \`]\` (\`[2001:db8::1]:8080\` becomes \`[2001:db8::1]\`). A literal that is never closed with \`]\`, or whose \`]\` is followed by anything other than nothing or a \`:\` port, is not a host.
- **Trailing dot:** after the port is removed, a single trailing \`.\` is removed (\`cdn.example.com.\` becomes \`cdn.example.com\`).
- **Case:** ASCII letters are lowercased, in hostnames and IPv6 literals alike (\`Example.COM\` becomes \`example.com\`).
- **Empty:** a value with nothing left after these steps is not a host.

Plain hostnames must keep normalizing exactly as they do now.

## Constraints

- No heap allocation: \`normalize_host\` runs on every request before routing, and \`out\` is the buffer to write into. Do not call \`malloc\`, \`calloc\`, \`realloc\`, \`strdup\` or \`strndup\`.`,
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
  comments: [],
  hints: [],
  team: [
    {
      id: "sam-no-malloc",
      author: "Sam R",
      role: "SRE",
      where: "review",
      severity: "blocking",
      text: [
        "normalize_host must not allocate on the heap (no malloc, calloc, realloc, strdup or strndup): write the result into out.",
      ],
      when: {
        pattern: "\\b(malloc|calloc|realloc|strdup|strndup)\\s*\\(",
        present: true,
        file: HOST_FILE,
      },
      repeat: "while-true",
    },
  ],
  private: {
    reference: { [HOST_FILE]: HOST_REFERENCE },
    examples: {
      "sam-no-malloc": {
        fires: [{ [HOST_FILE]: HOST_WITH_MALLOC }],
        quiet: [{ [HOST_FILE]: HOST_REFERENCE }, { [HOST_FILE]: HOST_ONE_FUNCTION }],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// GO-007: weighted upstreams (Go)

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

const weightedUpstreams: SeedIssue = {
  id: "weighted-upstreams",
  key: "GO-007",
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

Each \`server <name> weight=<n>;\` line is already parsed into a \`Backend\` (\`Name\`, \`Weight\`). The proxy calls \`RoundRobin.Next\` once per request; \`PickOrder(backends, n)\` returns where the next \`n\` requests go on a freshly loaded upstream (a new \`RoundRobin\` over \`backends\`), for previews before a rollout. Make the balancer honour weights.

## Rules

- A server with weight \`n\` gets \`n\` shares of the upstream's requests, spread out rather than in bursts (smooth weighted round robin, as nginx does it).
- \`weight=0\` drains a server: it keeps its place in the list but gets no requests and takes no part in the calculation below.
- With no servers, or every server drained, there is nowhere to send a request: \`Next\` returns \`false\` and \`PickOrder\` returns no picks (an empty list). \`PickOrder\` with \`n = 0\` also returns an empty list.
- Otherwise \`PickOrder\` returns exactly \`n\` server names, in order.

## The algorithm

1. Every server starts with a current value of 0.
2. For each request, add each non-drained server's weight to its current value.
3. Pick the server with the highest current value; on a tie, the one listed first.
4. Subtract the total weight of all non-drained servers from the picked server's current value.

Worked example with weights a=5, b=1, c=1 (total 7):

| Request | After adding weights (a, b, c) | Picked | After subtracting 7 |
|---|---|---|---|
| 1 | 5, 1, 1 | a | -2, 1, 1 |
| 2 | 3, 2, 2 | a | -4, 2, 2 |
| 3 | 1, 3, 3 | b | 1, -4, 3 |
| 4 | 6, -3, 4 | a | -1, -3, 4 |
| 5 | 4, -2, 5 | c | 4, -2, -2 |
| 6 | 9, -1, -1 | a | 2, -1, -1 |
| 7 | 7, 0, 0 | a | 0, 0, 0 |

## Constraints

- \`Next\` is called concurrently from every connection's goroutine and now updates shared state on each call: it must keep locking \`r.mu\` while it reads and updates that state.`,
  entrypoint: "PickOrder",
  starter: BALANCER_STARTER,
  parameters: ["backends", "n"],
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
  comments: [],
  hints: [],
  team: [
    {
      id: "mateo-keep-lock",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "RoundRobin.Next is called concurrently from every connection's goroutine, so it must lock r.mu while it reads and updates the balancer's state.",
      ],
      when: { pattern: "\\.Lock\\(\\)", present: false, file: BALANCER_FILE },
      repeat: "while-true",
    },
  ],
  private: {
    reference: { [BALANCER_FILE]: BALANCER_REFERENCE },
    examples: {
      "mateo-keep-lock": {
        fires: [{ [BALANCER_FILE]: BALANCER_UNLOCKED }],
        quiet: [{ [BALANCER_FILE]: BALANCER_REFERENCE }, { [BALANCER_FILE]: BALANCER_LONG }],
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// CPP-002: the cache index after #412 (C++), a teammate's change to judge

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

/** The same fix as two passes over the chain: correct, still a flat table. */
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

const cacheIndexPurge: SeedIssue = {
  id: "cache-index-purge",
  key: "CPP-002",
  title: "Cache hit ratio fell to 71% after the index change",
  summary: "Since #412, keys stored past a purged slot are reported as misses.",
  kind: "bug",
  difficulty: "hard",
  language: "cpp",
  skills: ["hash-tables", "caching", "reviewing-changes"],
  task: `On Thursday (#412) the response cache's index, a \`std::unordered_map<int, int>\`, was replaced with an open-addressing table. The map allocated one heap node per insert, about 9% of CPU at peak; the table allocates nothing per request. CPU at peak is down 9%, but since the deploy:

- the cache hit ratio went from **94.1%** to **71.3%**, worst on the PoPs that purge the most;
- origin requests are up **3.2×**;
- \`edgectl cache get\` reports misses for keys whose responses are visibly in the arena.

\`\`\`text
14:02:11 purge key=3                        ok
14:02:19 get   key=11  miss                 (arena slot 4: key=11, age 41s)
14:02:19 get   key=19  miss                 (arena slot 5: key=19, age 38s)
\`\`\`

Fix the index without giving up the flat table.

## The table

- A flat array of \`slots\` slots, allocated once when the index is created. \`slots\` is 0 or more.
- A key's home slot is \`key % slots\` (keys are already hashes, used as unsigned); on a collision, the next slot, wrapping around at the end (linear probing).
- A lookup walks from the home slot until it finds the key or reaches an empty slot.

## What to write

\`cache_index(slots, ops)\` replays a cache log against a new index of \`slots\` slots and returns what each get found, in order, \`-1\` for a miss. Each op is one of:

- \`["put", key, value]\`: store \`value\` (0 or more) under \`key\`, replacing any value already stored under it;
- \`["get", key]\`: look \`key\` up;
- \`["erase", key]\`: purge \`key\`, if it is stored (purging a key that is not stored does nothing).

The index must behave like a map of at most \`slots\` entries:

- A get finds the latest value put under its key, unless the key was purged since; otherwise it is a miss.
- A purged response must never come back.
- A put of a key that is already stored always succeeds. A put of a new key is refused (the response is served uncached, and later gets miss) only when every slot holds a live entry; slots freed by purges must be usable again.

## Constraints

- Keep the flat table, allocation-free: no node-based or heap containers (\`std::map\`, \`std::unordered_map\`, \`std::set\`, \`std::unordered_set\`, \`std::list\`), no \`new\`, and no \`make_unique\` or \`make_shared\`.`,
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
  comments: [],
  hints: [],
  team: [
    {
      id: "mateo-flat-table",
      author: "Mateo O",
      role: "Backend",
      where: "review",
      severity: "blocking",
      text: [
        "The index must stay an allocation-free flat table: no std::map, std::unordered_map, std::set, std::unordered_set or std::list, no new and no make_unique or make_shared.",
      ],
      when: {
        pattern:
          "#include\\s*<(unordered_map|map|list|unordered_set|set)>|std::(unordered_map|map|list|unordered_set|set)\\s*<|\\bnew\\s+[A-Za-z_]|make_(unique|shared)\\s*<",
        present: true,
        file: INDEX_FILE,
      },
      repeat: "while-true",
    },
  ],
  private: {
    reference: { [INDEX_FILE]: INDEX_REFERENCE },
    examples: {
      "mateo-flat-table": {
        fires: [{ [INDEX_FILE]: INDEX_NODE_MAP }],
        quiet: [
          { [INDEX_FILE]: INDEX_REFERENCE },
          { [INDEX_FILE]: INDEX_STARTER },
          { [INDEX_FILE]: INDEX_TWO_PASS },
        ],
      },
    },
  },
};

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [ipv6HostHeader, weightedUpstreams, cacheIndexPurge];
