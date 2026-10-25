The search box sends a request on every keystroke, about eight per query. It should send one request per pause in typing.

`debounceTimes(keystrokes, waitMs)` gets the keystroke times in milliseconds, in order (several can share a time), and the wait in milliseconds (0 or more). Return the times at which a search request fires, in order.

- Each keystroke schedules a request `waitMs` after it.
- A keystroke at or before the time the scheduled request would fire cancels it, and schedules its own.
- No keystrokes, no requests.
