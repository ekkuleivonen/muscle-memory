#include <stdlib.h>
#include "mm_json.h"

size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out);

/* [capacity, values] → the buffer's contents, oldest first. */
mm_value *mm_call(const mm_value *args) {
    size_t capacity = (size_t)mm_integer(mm_at(args, 0));
    const mm_value *list = mm_at(args, 1);
    size_t count = mm_length(list);
    int *values = calloc(count + 1, sizeof(int));
    int *out = calloc(count + 1, sizeof(int));
    for (size_t i = 0; i < count; i++)
        values[i] = (int)mm_integer(mm_at(list, i));
    size_t kept = ring_buffer(capacity, values, count, out);
    mm_value *result = mm_new_array();
    for (size_t i = 0; i < kept && i <= count; i++)
        mm_push(result, mm_new_integer(out[i]));
    return result;
}
