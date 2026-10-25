The latency panel shows percentiles of request latencies, such as the p99.

`Percentile(samples, p)` returns the nearest-rank percentile of the latency samples. `samples` are in any order and can repeat; `p` is greater than 0 and at most 100.

- The value is the one at rank `ceil(p / 100 × n)` among the `n` samples in ascending order, counting from 1, and `ok` is true.
- With no samples, `ok` is false (the checks show this as `null`).
