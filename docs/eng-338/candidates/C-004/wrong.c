#include <stddef.h>
size_t remove_value(const int *values, size_t count, int target, int *out)
{
    size_t written = 0;
    int removed = 0;
    for (size_t i = 0; i < count; ++i) {
        if (!removed && values[i] == target) removed = 1;
        else out[written++] = values[i];
    }
    return written;
}
