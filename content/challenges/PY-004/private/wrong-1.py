# Drops every quote, then splits: Acme's comma still splits the name.
def parse_csv_line(line):
    return line.replace('"', "").split(",")
