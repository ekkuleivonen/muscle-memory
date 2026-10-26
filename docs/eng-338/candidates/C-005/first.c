#include <stddef.h>
int common_divisor(const int *values, size_t count)
{
    int result = 0;
    for (size_t i = 0; i < count; ++i) {
        int n = values[i] < 0 ? -values[i] : values[i];
        while (n != 0) {
            int remainder = result % n;
            result = n;
            n = remainder;
        }
    }
    return result;
}
