#include <stdlib.h>
#include <string.h>
#include "mm_json.h"

int normalize_host(const char *host, char *out, size_t size);

/* [host, size] → the normalized host, or null for failure.
 * Backing storage remains large enough even for a mistaken write; size is the
 * logical caller capacity passed to the function, not a truncated result. */
mm_value *mm_call(const mm_value *args) {
    const char *host = mm_string(mm_at(args, 0));
    size_t backing = strlen(host) + 1;
    size_t size = (size_t)mm_integer(mm_at(args, 1));
    char *out = calloc(backing, 1);
    int len = normalize_host(host, out, size);
    /* Only the specified -1 return is a legitimate failure. An invalid
     * nonnegative success must fail the case, not masquerade as null. No
     * challenge case expects a boolean, so false is a contract-error sentinel. */
    mm_value *result;
    if (len == -1)
        result = mm_new_null();
    else if (len < 0 || (size_t)len >= size || (size_t)len != strlen(out))
        result = mm_new_bool(0);
    else
        result = mm_new_string(out);
    free(out);
    return result;
}
