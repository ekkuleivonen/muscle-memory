# Strips spaces the partner wrote.
import csv
import io


def parse_csv_line(line):
    row = next(csv.reader(io.StringIO(line, newline=""), skipinitialspace=True), [""])
    return [field.strip() for field in row]
