#include "mm_json.h"
#include <stdlib.h>
int common_divisor(const int *, size_t);
mm_value *mm_call(const mm_value *args) {
    const mm_value *list = mm_at(args, 0);
    size_t n = mm_length(list);
    int *a = calloc(n + 1, sizeof(int));
    int *out = calloc(n + 1, sizeof(int));
    for (size_t i = 0; i < n; i++)
        a[i] = (int)mm_integer(mm_at(list, i));
    return mm_new_integer(common_divisor(a, n));
}
