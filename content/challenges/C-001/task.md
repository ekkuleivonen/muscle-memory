Since the IPv6 listener went live on Tuesday, every request that addresses the proxy by its v6 literal gets the default vhost's **421 Misdirected Request**. The health checker on `[2001:db8::1]:8080` has been red since; on-call silenced it at 02:10.

```text
421 GET http://[2001:db8::1]:8080/healthz host="[2001" vhost=default
421 GET http://[2001:db8::1]/healthz      host="["     vhost=default
```

The proxy routes each request on its Host header after `normalize_host` has normalized it, and the response cache keys on the same value, so two spellings of one host share a vhost and cache entries. Plain hostnames already work; IPv6 literals do not, because the current code treats the first `:` as the start of the port.

## What to write

`int normalize_host(const char *host, char *out, size_t size)`

- `host` is the raw Host header value, a NUL-terminated string.
- Write the normalized host into `out`, NUL-terminated, and return its length (not counting the terminator).
- `size` is the size of `out` in bytes, terminator included. If the result plus its terminator does not fit, return `-1`.
- Return `-1` when the value is not a host. The examples show `-1` as `null`, and a string for a host.

## Normalizing rules

- **Port:** remove the port. For a hostname, the port is everything from the first `:` on (`example.com:8443` becomes `example.com`).
- **IPv6 literals:** a value starting with `[` is an IPv6 literal. It keeps its brackets and loses only a port after the closing `]` (`[2001:db8::1]:8080` becomes `[2001:db8::1]`). A literal that is never closed with `]`, or whose `]` is followed by anything other than nothing or a `:` port, is not a host.
- **Trailing dot:** after the port is removed, a single trailing `.` is removed (`cdn.example.com.` becomes `cdn.example.com`).
- **Case:** ASCII letters are lowercased, in hostnames and IPv6 literals alike (`Example.COM` becomes `example.com`).
- **Empty:** a value with nothing left after these steps is not a host.

Plain hostnames must keep normalizing exactly as they do now.

## Constraints

- No heap allocation: `normalize_host` runs on every request before routing, and `out` is the buffer to write into. Do not call `malloc`, `calloc`, `realloc`, `strdup` or `strndup`.
