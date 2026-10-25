/* Mistake: minimum magnitude need not divide the others. */
#include <stddef.h>
int common_divisor(const int *v, size_t n) {
    int g = 0;
    for (size_t i = 0; i < n; i++) {
        int x = v[i] < 0 ? -v[i] : v[i];
        if (x && (!g || x < g))
            g = x;
    }
    return g;
}
