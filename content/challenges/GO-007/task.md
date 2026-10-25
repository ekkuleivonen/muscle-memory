This upstream should send 10% of its requests to origin-v2:

```text
upstream origin {
    server origin-v1 weight=9;
    server origin-v2 weight=1;
}
```

but the balancer never looks at weights: over 20,000 requests, origin-v2 got **10,041** (50.2%).

Each `server <name> weight=<n>;` line is already parsed into a `Backend` (`Name`, `Weight`). The proxy calls `RoundRobin.Next` once per request; `PickOrder(backends, n)` returns where the next `n` requests go on a freshly loaded upstream (a new `RoundRobin` over `backends`), for previews before a rollout. Make the balancer honour weights.

## Rules

- A server with weight `n` gets `n` shares of the upstream's requests, spread out rather than in bursts (smooth weighted round robin, as nginx does it).
- `weight=0` drains a server: it keeps its place in the list but gets no requests and takes no part in the calculation below.
- With no servers, or every server drained, there is nowhere to send a request: `Next` returns `false` and `PickOrder` returns no picks (an empty list). `PickOrder` with `n = 0` also returns an empty list.
- Otherwise `PickOrder` returns exactly `n` server names, in order.

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

- `Next` is called concurrently from every connection's goroutine and now updates shared state on each call: it must keep locking `r.mu` while it reads and updates that state.
