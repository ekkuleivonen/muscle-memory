#include <stddef.h>
int common_divisor(const int *values, size_t count) {
    int g = 0;
    for (size_t i = 0; i < count; i++) {
        int b = values[i] < 0 ? -values[i] : values[i];
        while (b) {
            int r = g % b;
            g = b;
            b = r;
        }
    }
    return g;
}
