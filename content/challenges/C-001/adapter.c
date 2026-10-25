#include <stdlib.h>
#include <string.h>
#include "mm_json.h"

int normalize_host(const char *host, char *out, size_t size);

/* [host] → the normalized host, or null when the value is not a host. */
mm_value *mm_call(const mm_value *args) {
    const char *host = mm_string(mm_at(args, 0));
    size_t size = strlen(host) + 1;
    char *out = calloc(size, 1);
    int len = normalize_host(host, out, size);
    mm_value *result = len < 0 ? mm_new_null() : mm_new_string(out);
    free(out);
    return result;
}
