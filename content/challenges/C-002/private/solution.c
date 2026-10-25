#include <stddef.h>

/* Reverses items[from, to). */
static void reverse(int *items, size_t from, size_t to)
{
    while (from + 1 < to) {
        int held = items[from];
        items[from++] = items[--to];
        items[to] = held;
    }
}

/*
 * Keeps the last `capacity` request latencies. Push each value in order, then
 * write the contents oldest first into `out` and return how many there are.
 */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    size_t next = 0;
    size_t size = 0;
    if (capacity == 0)
        return 0;
    /* out is the buffer itself: the oldest entry is overwritten once it is full. */
    for (size_t i = 0; i < count; i++) {
        out[next] = values[i];
        next = (next + 1) % capacity;
        if (size < capacity)
            size++;
    }
    /* Rotate so the oldest entry, at next, comes first. */
    if (size == capacity && next != 0) {
        reverse(out, 0, next);
        reverse(out, next, size);
        reverse(out, 0, size);
    }
    return size;
}
