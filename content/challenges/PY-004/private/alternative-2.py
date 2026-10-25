# A different hand-written parser: one field at a time.
def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    fields = []
    i = 0
    while True:
        if line[i : i + 1] == '"':
            end = i + 1
            value = ""
            while True:
                close = line.index('"', end)
                value += line[end:close]
                if line[close + 1 : close + 2] == '"':
                    value += '"'
                    end = close + 2
                else:
                    i = close + 1
                    break
            fields.append(value)
        else:
            comma = line.find(",", i)
            stop = len(line) if comma == -1 else comma
            fields.append(line[i:stop])
            i = stop
        if i >= len(line):
            return fields
        i += 1
        if i == len(line):
            fields.append("")
            return fields
