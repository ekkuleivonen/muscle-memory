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
 * How much of the value is the host: an IPv6 literal up to and including its closing
 * bracket, anything else up to the port. -1 when a literal is never closed or is followed
 * by something other than a port.
 */
static long host_length(const char *host)
{
    if (host[0] != '[') {
        const char *colon = strchr(host, ':');
        return colon ? (long)(colon - host) : (long)strlen(host);
    }
    const char *close = strchr(host, ']');
    if (!close || (close[1] != '\0' && close[1] != ':'))
        return -1;
    return (long)(close - host) + 1;
}

/*
 * Writes the normalized host into out (size bytes, terminator included) and returns its
 * length, or -1 when the value is not a host.
 */
int normalize_host(const char *host, char *out, size_t size)
{
    long len = host_length(host);
    if (len < 0)
        return -1;
    if (len > 0 && host[len - 1] == '.')
        len--;
    if (len == 0 || (size_t)len + 1 > size)
        return -1;
    for (long i = 0; i < len; i++)
        out[i] = lower(host[i]);
    out[len] = '\0';
    return (int)len;
}
