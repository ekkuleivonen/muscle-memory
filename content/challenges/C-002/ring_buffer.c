#include <stddef.h>

/*
 * Keeps the last `capacity` request latencies. Push each value in order, then
 * write the contents oldest first into `out` and return how many there are.
 */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    (void)capacity;
    (void)values;
    (void)count;
    (void)out;
    return 0;
}
