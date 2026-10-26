#include <stddef.h>

/* Keeps the last capacity latencies, oldest first. */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    size_t kept = capacity < count ? capacity : count;
    size_t start = count - kept;
    for (size_t i = 0; i < kept; ++i)
        out[i] = values[start + i];
    return kept;
}
