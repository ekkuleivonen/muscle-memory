/* Mistake: reverses retained values. */
#include <stddef.h>
size_t remove_value(const int *v, size_t n, int t, int *out) {
    size_t k = 0;
    while (n)
        if (v[--n] != t)
            out[k++] = v[n];
    return k;
}
