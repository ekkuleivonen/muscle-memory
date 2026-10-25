Since Northwind started quoting company names, their nightly customer import loads rows into the wrong columns. From last night's load:

```text
line   "Acme, Inc.",42,"NY"
loaded name='"Acme'  account=' Inc."'  region='42'
```

`parse_csv_line(line)` splits one line of a partner export into its fields and returns them as a list of strings.

- Fields are separated by commas, except for commas inside double quotes.
- The quotes around a quoted field are not part of the field, and a doubled quote inside a quoted field is one literal quote: `"say ""hi"""` → `say "hi"`.
- A quoted field may contain a line break.
- Spaces are kept as written. Empty fields are kept, including at the start or end of the line.
- An empty line is a single empty field, which the import reports as a row with no name.
