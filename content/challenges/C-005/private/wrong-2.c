/* Mistake: only examines first two numbers. */
#include <stddef.h>
int common_divisor(const int *v, size_t n) {
    int a = n ? v[0] : 0, b = n > 1 ? v[1] : 0;
    if (a < 0)
        a = -a;
    if (b < 0)
        b = -b;
    while (b) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}
