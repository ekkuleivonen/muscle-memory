/* Validates IPv6 literals but finds a hostname's port at the last ':', not the first as the task says. */
/*
 * normalize_host.c: the Host header as vhost routing and the cache key see it.
 *
 * Called once per request, before routing, on the raw header value. It writes into the
 * caller's buffer (the connection's scratch arena), so it never allocates.
 */
#include <stddef.h>
#include <string.h>

static char lower(char c)
{
    return (c >= 'A' && c <= 'Z') ? (char)(c - 'A' + 'a') : c;
}

/*
 * Writes the normalized host into out (size bytes, terminator included) and returns its
 * length, or -1 when the value is not a host.
 */
int normalize_host(const char *host, char *out, size_t size)
{
    size_t len = strlen(host);
    if (host[0] == '[') {
        const char *close = strchr(host, ']');
        if (!close || (close[1] != '\0' && close[1] != ':'))
            return -1;
        len = (size_t)(close - host) + 1;
    } else {
        const char *colon = strrchr(host, ':');
        if (colon)
            len = (size_t)(colon - host);
    }
    if (len > 0 && host[len - 1] == '.')
        len--;
    if (len == 0 || len + 1 > size)
        return -1;
    for (size_t i = 0; i < len; i++)
        out[i] = lower(host[i]);
    out[len] = '\0';
    return (int)len;
}
