The cache's hit rate dropped to 12% after the last deploy: entries that were just read get evicted.

`simulate(capacity, ops)` runs `ops` in order against an empty least-recently-used (LRU) cache that holds at most `capacity` entries (at least 1), and returns the result of each get, in order.

- `["put", key, value]` stores `value` under `key`. If the key is already cached, its value is replaced. If the key is new and the cache is full, the least recently used entry is evicted first.
- `["get", key]` returns the key's value, or `-1` when it isn't cached.
- A put and a get that finds its key both count as a use, making that key the most recently used. A get that misses changes nothing.
