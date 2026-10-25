#include <stddef.h>
int longest_run(const int *values, size_t count) {
    int best = 0;
    for (size_t i = 0; i < count;) {
        size_t j = i + 1;
        while (j < count && values[j] == values[i])
            j++;
        if ((int)(j - i) > best)
            best = (int)(j - i);
        i = j;
    }
    return best;
}
