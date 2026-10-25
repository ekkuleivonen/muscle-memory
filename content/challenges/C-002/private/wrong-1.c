/* Once the buffer wraps, writes the slots from index 0 instead of from the oldest entry. */
#include <stddef.h>

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
    for (size_t i = 0; i < count; i++) {
        out[next] = values[i];
        next = (next + 1) % capacity;
        if (size < capacity)
            size++;
    }
    return size;
}
