/*
 * normalize_host.c: the Host header as vhost routing and the cache key see it.
 * Called once per request; uses the caller's buffer and never allocates.
 */
#include <stddef.h>
#include <string.h>

static char lower(char c)
{
    return (c >= 'A' && c <= 'Z') ? (char)(c - 'A' + 'a') : c;
}

int normalize_host(const char *host, char *out, size_t size)
{
    size_t len;
    if (host[0] == '[') {
        const char *close = strchr(host, ']');
        if (!close)
            return -1;
        len = (size_t)(close - host) + 1;
    } else {
        const char *colon = strchr(host, ':');
        len = colon ? (size_t)(colon - host) : strlen(host);
    }
    if (len > 0 && host[len - 1] == '.')
        len--;
    if (len == 0 || len >= size)
        return -1;
    for (size_t i = 0; i < len; i++)
        out[i] = lower(host[i]);
    out[len] = '\0';
    return (int)len;
}
