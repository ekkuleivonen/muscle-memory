Alerting is blind to the 502s: the access log parser comes back with empty fields.

`ParseLine(line)` parses one access log line, such as `GET /cart 200 12ms`, into an `Entry`. A line has four fields separated by single spaces:

- `Method`: the HTTP method, as written.
- `Path`: the request path as written, including any query string. It never contains a space.
- `Status`: the status code, as an integer.
- `Ms`: the duration, as an integer. Durations are always whole milliseconds followed by `ms`: `1300ms` is `1300`.
