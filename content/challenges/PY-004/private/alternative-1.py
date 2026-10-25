# The standard library's reader, with the blank line handled.
import csv
import io


def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    return next(csv.reader(io.StringIO(line, newline="")), [""])
