def parse_csv_line(line):
    """Split CSV fields, retaining spaces and quoted line breaks."""
    result = []
    field = []
    quoted = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == '"':
            if quoted and i + 1 < len(line) and line[i + 1] == '"':
                field.append('"')
                i += 2
                continue
            quoted = not quoted
        elif ch == ',' and not quoted:
            result.append(''.join(field))
            field = []
        else:
            field.append(ch)
        i += 1
    result.append(''.join(field))
    return result
