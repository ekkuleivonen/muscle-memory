/* Overwrites the newest entry instead of the oldest when the buffer is full. */
#include <stddef.h>

/*
 * Keeps the last `capacity` request latencies. Push each value in order, then
 * write the contents oldest first into `out` and return how many there are.
 */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    size_t size = 0;
    if (capacity == 0)
        return 0;
    for (size_t i = 0; i < count; i++) {
        if (size < capacity)
            out[size++] = values[i];
        else
            out[size - 1] = values[i];
    }
    return size;
}
