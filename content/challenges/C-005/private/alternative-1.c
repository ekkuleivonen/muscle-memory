#include <stddef.h>
int common_divisor(const int *v, size_t n) {
    int max = 0;
    for (size_t i = 0; i < n; i++) {
        int x = v[i] < 0 ? -v[i] : v[i];
        if (x > max)
            max = x;
    }
    for (int d = max; d > 0; d--) {
        int ok = 1;
        for (size_t i = 0; i < n; i++)
            if (v[i] % d)
                ok = 0;
        if (ok)
            return d;
    }
    return 0;
}
