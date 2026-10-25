Sign-up compares email addresses exactly as typed, so someone who signed up as `Jane.Doe@Example.com` and signs up again as `jane.doe@example.com ` gets a second account. Write the key sign-up looks accounts up by, so one person gets one account however they type their address. (The address itself is still stored exactly as typed; this is only the lookup key.)

`CanonicalEmail(raw)` returns the key and `ok` true, or `""` and `ok` false for anything that is not an address we accept:

- Surrounding whitespace is ignored. Whitespace anywhere inside the address (spaces, tabs, any Unicode space) makes it invalid.
- An address has exactly one `@`, with something on both sides of it.
- The whole address is lowercased: every provider our users are on treats the local part case-insensitively.
- For **gmail.com** and **googlemail.com** (those exact domains after lowercasing; not their subdomains or longer domains), dots in the local part are dropped, so is everything from the first `+` on, and the domain becomes `gmail.com`. Other domains keep their dots and `+` tags as they are: plenty of mail servers deliver `+` addresses to different people.
- If the Gmail rules leave the local part empty, the address is invalid.
