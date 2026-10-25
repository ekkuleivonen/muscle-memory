A response cache's index, from a key to its cached value, is a flat open-addressing table instead of a `std::unordered_map`, so it allocates nothing per request. But it loses entries: after a purge, keys stored further along the probe chain are reported as misses.

```text
slots=8
put   key=3   ok
put   key=11  ok     (home slot taken by 3, stored one slot further)
erase key=3   ok
get   key=11  miss   ← it is still in the table
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
