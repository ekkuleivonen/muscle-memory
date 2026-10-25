# Respects quotes but treats a doubled quote as closing and reopening the field.
def parse_csv_line(line):
    fields, field, quoted = [], [], False
    for char in line:
        if char == '"':
            quoted = not quoted
        elif char == "," and not quoted:
            fields.append("".join(field))
            field = []
        else:
            field.append(char)
    fields.append("".join(field))
    return fields
