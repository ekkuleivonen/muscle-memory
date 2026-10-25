#include <stddef.h>
#include <string.h>

/* Scan the boundary first, then copy exactly the normalized output. */
int normalize_host(const char *host, char *out, size_t size) {
    const char *end;
    if (*host == '[') {
        const char *close = strchr(host, ']');
        if (!close || (close[1] && close[1] != ':')) return -1;
        end = close + 1;
    } else {
        end = host + strcspn(host, ":");
    }
    if (end > host && end[-1] == '.') end--;
    size_t len = (size_t)(end - host);
    if (!len || len >= size) return -1;
    for (size_t i = 0; i < len; i++) {
        char c = host[i];
        out[i] = c >= 'A' && c <= 'Z' ? c + ('a' - 'A') : c;
    }
    out[len] = '\0';
    return (int)len;
}
