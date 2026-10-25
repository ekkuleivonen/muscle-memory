Workspace URLs are `/w/<slug>`. For names with accents, the link we email is percent-encoded and 404s.

`slugify(name)` turns a workspace name into its slug:

- The slug has only lowercase ASCII letters `a`–`z`, digits `0`–`9` and hyphens. Uppercase letters become lowercase.
- Accented Latin letters lose their accents and keep their base letter, whether the accent is part of the character or a separate combining mark after it: `"Café Ünïcorn"` → `"cafe-unicorn"`.
- Every run of anything else (spaces, punctuation, underscores, hyphens, symbols, emoji, other scripts) between kept characters becomes a single hyphen. There is no hyphen at either end.
- A name with nothing to keep gives `""`.
