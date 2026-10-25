/* Mistake: misses the run ending at the last element. */
#include <stddef.h>
int longest_run(const int *v, size_t n) {
    int b = 0, r = 1;
    for (size_t i = 1; i < n; i++) {
        if (v[i] == v[i - 1])
            r++;
        else {
            if (r > b)
                b = r;
            r = 1;
        }
    }
    return b;
}
