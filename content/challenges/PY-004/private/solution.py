def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    fields, field, quoted, i = [], [], False, 0
    while i < len(line):
        char = line[i]
        if quoted and char == '"' and line[i + 1 : i + 2] == '"':
            field.append('"')
            i += 1
        elif char == '"':
            quoted = not quoted
        elif char == "," and not quoted:
            fields.append("".join(field))
            field = []
        else:
            field.append(char)
        i += 1
    fields.append("".join(field))
    return fields
