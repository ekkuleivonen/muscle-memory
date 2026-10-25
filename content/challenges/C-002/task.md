The edge proxy keeps the most recent request latencies in memory, in a fixed-size ring buffer that overwrites its oldest entry when it is full.

`ring_buffer(capacity, values, count, out)` pushes the `count` integers in `values`, in order, into an empty buffer that holds `capacity` entries. A push into a full buffer overwrites the oldest entry. Then it writes what the buffer holds into `out`, oldest first, and returns how many entries it wrote.

- `out` has room for at least `count` integers.
- A capacity of 0 holds nothing.
