#include <stddef.h>
int longest_run(const int *values, size_t count)
{
    if (count == 0) return 0;
    int best = 1, current = 1;
    for (size_t i = 1; i < count; ++i) {
        if (values[i] == values[i - 1]) ++current;
        else {
            if (current > best) best = current;
            current = 1;
        }
    }
    return best;
}
