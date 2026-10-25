Timeouts in config must be written in seconds, and somebody set `idle_timeout = 3600` meaning minutes. Let people write `1h`.

`ParseDuration(text)` turns a duration such as `"1h30m"`, `"45s"` or `"2h"` into seconds, or returns an error when the text isn't a valid duration (the checks show an error as `null`).

- A valid duration is one or more parts written together, each a whole number in digits followed by a unit: `h` (hours), `m` (minutes) or `s` (seconds).
- Each unit appears at most once, in the order `h`, `m`, `s`, and any of them can be left out. A number can be 0 and can be larger than the next unit up.
- Anything else is an error: for example an empty string, a number without a unit, a unit without a number, any other unit or an uppercase one, a sign, a decimal point, spaces, or units repeated or out of order.
