On Thursday (#412) the response cache's index, a `std::unordered_map<int, int>`, was replaced with an open-addressing table. The map allocated one heap node per insert, about 9% of CPU at peak; the table allocates nothing per request. CPU at peak is down 9%, but since the deploy:

- the cache hit ratio went from **94.1%** to **71.3%**, worst on the PoPs that purge the most;
- origin requests are up **3.2×**;
- `edgectl cache get` reports misses for keys whose responses are visibly in the arena.

```text
14:02:11 purge key=3                        ok
14:02:19 get   key=11  miss                 (arena slot 4: key=11, age 41s)
14:02:19 get   key=19  miss                 (arena slot 5: key=19, age 38s)
```

Fix the index without giving up the flat table.

## The table

- A flat array of `slots` slots, allocated once when the index is created. `slots` is 0 or more.
- A key's home slot is `key % slots` (keys are already hashes, used as unsigned); on a collision, the next slot, wrapping around at the end (linear probing).
- A lookup walks from the home slot until it finds the key or reaches an empty slot.

## What to write

`cache_index(slots, ops)` replays a cache log against a new index of `slots` slots and returns what each get found, in order, `-1` for a miss. Each op is one of:

- `["put", key, value]`: store `value` (0 or more) under `key`, replacing any value already stored under it;
- `["get", key]`: look `key` up;
- `["erase", key]`: purge `key`, if it is stored (purging a key that is not stored does nothing).

The index must behave like a map of at most `slots` entries:

- A get finds the latest value put under its key, unless the key was purged since; otherwise it is a miss.
- A purged response must never come back.
- A put of a key that is already stored always succeeds. A put of a new key is refused (the response is served uncached, and later gets miss) only when every slot holds a live entry; slots freed by purges must be usable again.

## Constraints

- Keep the flat table, allocation-free: no node-based or heap containers (`std::map`, `std::unordered_map`, `std::set`, `std::unordered_set`, `std::list`), no `new`, and no `make_unique` or `make_shared`.
