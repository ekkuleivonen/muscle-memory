#include <stddef.h>

/*
 * Keeps the last `capacity` request latencies. Push each value in order, then
 * write the contents oldest first into `out` and return how many there are.
 */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    /* Only the last `capacity` pushes survive, and they come out in the order they went in. */
    size_t kept = count < capacity ? count : capacity;
    size_t first = count - kept;
    for (size_t i = 0; i < kept; i++)
        out[i] = values[first + i];
    return kept;
}
