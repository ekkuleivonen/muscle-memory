/* Takes the port from the last ':' after the last ']', never checking that a literal is closed or followed only by a port. */
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
    const char *colon = strrchr(host, ':');
    const char *close = strrchr(host, ']');
    if (colon && (!close || colon > close))
        len = (size_t)(colon - host);
    if (len > 0 && host[len - 1] == '.')
        len--;
    if (len == 0 || len + 1 > size)
        return -1;
    for (size_t i = 0; i < len; i++)
        out[i] = lower(host[i]);
    out[len] = '\0';
    return (int)len;
}
