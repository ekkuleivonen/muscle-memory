/* Mistake: retains the target instead. */
#include <stddef.h>
size_t remove_value(const int *v, size_t n, int t, int *out) {
    size_t k = 0;
    for (size_t i = 0; i < n; i++)
        if (v[i] == t)
            out[k++] = v[i];
    return k;
}
