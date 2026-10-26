#include <stddef.h>
int longest_run(const int *values, size_t count)
{
    if (count == 0) return 0;
    int best = 1, current = 1;
    for (size_t i = 1; i < count; ++i) {
        current = values[i] == values[i - 1] ? current + 1 : 1;
        if (current > best) best = current;
    }
    return best;
}
