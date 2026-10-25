#include "mm_json.h"
#include <stdlib.h>
size_t remove_value(const int *, size_t, int, int *);
mm_value *mm_call(const mm_value *args) {
    const mm_value *list = mm_at(args, 0);
    size_t n = mm_length(list);
    int *a = calloc(n + 1, sizeof(int));
    int *out = calloc(n + 1, sizeof(int));
    for (size_t i = 0; i < n; i++)
        a[i] = (int)mm_integer(mm_at(list, i));
    size_t count = remove_value(a, n, (int)mm_integer(mm_at(args, 1)), out);
    /* An invalid reported length must not be silently truncated. */
    if (count > n)
        return mm_new_null();
    mm_value *r = mm_new_array();
    for (size_t i = 0; i < count; i++)
        mm_push(r, mm_new_integer(out[i]));
    return r;
}
