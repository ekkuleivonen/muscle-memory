#include <stddef.h>
int longest_run(const int *values, size_t count) {
    int best = 0, run = 0;
    for (size_t i = 0; i < count; i++) {
        run = (i && values[i] == values[i - 1]) ? run + 1 : 1;
        if (run > best)
            best = run;
    }
    return best;
}
