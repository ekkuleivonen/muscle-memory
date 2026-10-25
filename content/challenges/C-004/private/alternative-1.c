#include <stddef.h>
size_t remove_value(const int *values, size_t count, int target, int *out) {
    if (!count)
        return 0;
    size_t n = remove_value(values, count - 1, target, out);
    if (values[count - 1] != target)
        out[n++] = values[count - 1];
    return n;
}
