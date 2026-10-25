/*
 * normalize_host.c: the Host header as vhost routing and the cache key see it.
 *
 * Called once per request, before routing, on the raw header value. It writes into the
 * caller's buffer (the connection's scratch arena), so it never allocates.
 */
#include <stddef.h>
#include <string.h>

/*
 * Writes the normalized host into out (size bytes, terminator included) and returns its
 * length, or -1 when the value is not a host.
 */
int normalize_host(const char *host, char *out, size_t size)
{
    /* One pass: copy and lowercase until the host ends, then check what ends it. */
    int literal = host[0] == '[';
    size_t len = 0;
    for (;;) {
        char c = host[len];
        if (c == '\0') {
            if (literal)
                return -1; /* never closed */
            break;
        }
        if (!literal && c == ':')
            break;
        if (len + 1 >= size)
            return -1;
        out[len++] = (c >= 'A' && c <= 'Z') ? (char)(c - 'A' + 'a') : c;
        if (literal && c == ']') {
            if (host[len] != '\0' && host[len] != ':')
                return -1;
            break;
        }
    }
    if (len > 0 && out[len - 1] == '.')
        len--;
    if (len == 0)
        return -1;
    out[len] = '\0';
    return (int)len;
}
