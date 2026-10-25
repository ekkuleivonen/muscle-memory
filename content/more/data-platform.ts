import type { SeedIssue } from "../seed";

/** A pipeline package's __init__.py: only its docstring. */
const PIPELINE_INIT = (what: string) => `"""${what}"""
`;

const NORMALIZE = `"""Normalising fields before records are compared or loaded."""


def normalize_email(email):
    """An email as we compare it: trimmed and lowercased.

    None when there is no usable email on file (missing, empty or only spaces): phone and
    in-store customers often have none.
    """
    if email is None:
        return None
    email = email.strip().lower()
    return email or None
`;

const DEDUPE_STARTER = `from pipeline.normalize import normalize_email


def _fill_blanks(customer, duplicate):
    """Fields the first record left blank are taken from a later duplicate."""
    for field, value in duplicate.items():
        if customer.get(field) in (None, ""):
            customer[field] = value


def dedupe_customers(rows):
    """One record per customer, in the order customers were first seen.

    Records whose emails match after normalising are the same customer: the first one is
    kept, and later duplicates only fill in fields it left blank. A record without an email
    cannot be matched to anything, so it is always kept as it is. Input rows are not changed.
    """
    # One pass with a dict instead of comparing every pair: the Northwind file has 180k rows.
    customers = {}
    for row in rows:
        key = normalize_email(row.get("email"))
        if key in customers:
            _fill_blanks(customers[key], row)
            continue
        customers[key] = dict(row)
    return list(customers.values())
`;

const DEDUPE_REFERENCE = `from pipeline.normalize import normalize_email


def _fill_blanks(customer, duplicate):
    """Fields the first record left blank are taken from a later duplicate."""
    for field, value in duplicate.items():
        if customer.get(field) in (None, ""):
            customer[field] = value


def dedupe_customers(rows):
    """One record per customer, in the order customers were first seen.

    Records whose emails match after normalising are the same customer: the first one is
    kept, and later duplicates only fill in fields it left blank. A record without an email
    cannot be matched to anything, so it is always kept as it is. Input rows are not changed.
    """
    # One pass with a dict instead of comparing every pair: the Northwind file has 180k rows.
    customers = []
    by_email = {}
    for row in rows:
        key = normalize_email(row.get("email"))
        if key is not None and key in by_email:
            _fill_blanks(by_email[key], row)
            continue
        customer = dict(row)
        customers.append(customer)
        # Without an email there is nothing to match later records against.
        if key is not None:
            by_email[key] = customer
    return customers
`;

const MONEY = `"""Money is whole cents everywhere: never floats."""
from decimal import Decimal, InvalidOperation


def to_cents(text):
    """A plain decimal amount ("12.50", "-3", " 7.05 ") as whole cents.

    Raises ValueError for anything else. Partner-specific formats are the reader's job.
    """
    try:
        value = Decimal(text.strip())
    except InvalidOperation:
        raise ValueError(f"not an amount: {text!r}") from None
    if not value.is_finite() or value != value.quantize(Decimal("0.01")):
        raise ValueError(f"not an amount: {text!r}")
    return int(value * 100)
`;

/** The settlement reader, inlined into the report so the whole fix is in one file. */
const READER_STARTER = `import csv
import io

from pipeline.money import to_cents

KINDS = {"sale", "refund", "adjustment"}


def read_settlements(text):
    """The rows of a partner settlement export, and how many rows were rejected.

    Each row has partner, order, kind, currency and amount: signed cents, as the partner
    wrote them. These rows are also loaded into raw_settlements as they are. A row that can't
    be read is rejected (counted and left out) rather than guessed at.
    """
    rows = []
    rejected = 0
    for raw in csv.DictReader(io.StringIO(text)):
        kind = raw["type"].strip().lower()
        if kind not in KINDS:
            rejected += 1
            continue
        try:
            amount = to_cents(raw["amount"])
        except ValueError:
            rejected += 1
            continue
        rows.append({
            "partner": raw["partner"].strip(),
            "order": raw["order_id"].strip(),
            "kind": kind,
            "currency": raw["currency"].strip().upper(),
            "amount": amount,
        })
    return rows, rejected
`;

const READER_REFERENCE = READER_STARTER.replace(
  'KINDS = {"sale", "refund", "adjustment"}\n',
  `KINDS = {"sale", "refund", "adjustment"}


def parse_amount(text):
    """A plain amount, or an accounting negative in brackets: (12.50) is -12.50."""
    text = text.strip()
    if text.startswith("(") and text.endswith(")"):
        return -to_cents(text[1:-1])
    return to_cents(text)
`,
).replace('amount = to_cents(raw["amount"])', 'amount = parse_amount(raw["amount"])');

const SUMMARY_STARTER = `def settlement_summary(text):
    """What finance reconciles each partner's statement against.

    Per partner and currency, sorted by both: how many sales and refunds, and net in cents.
    Net is sales less refunds, plus adjustments (fees, corrections) with their own sign.
    Also how many rows the reader rejected, so nobody signs off on a partial file.
    """
    rows, rejected = read_settlements(text)
    totals = {}
    for row in rows:
        key = (row["partner"], row["currency"])
        if key not in totals:
            totals[key] = {"partner": key[0], "currency": key[1], "sales": 0, "refunds": 0, "net": 0}
        total = totals[key]
        if row["kind"] == "sale":
            total["sales"] += 1
            total["net"] += row["amount"]
        elif row["kind"] == "refund":
            total["refunds"] += 1
            total["net"] -= row["amount"]
        else:
            total["net"] += row["amount"]
    return {"partners": [totals[key] for key in sorted(totals)], "rejected": rejected}
`;

const SUMMARY_REFERENCE = SUMMARY_STARTER.replace(
  '            total["net"] -= row["amount"]',
  '            # Partners write refunds either way round; a refund always gives money back.\n            total["net"] -= abs(row["amount"])',
);

const REPORT_STARTER = READER_STARTER + "\n\n" + SUMMARY_STARTER;
const REPORT_REFERENCE = READER_REFERENCE + "\n\n" + SUMMARY_REFERENCE;

const COLLECTED_STARTER = `-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
SELECT o.partner, SUM(o.total) AS collected
FROM orders o
JOIN payments p ON p.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC;
`;

const COLLECTED_REFERENCE = `-- Finance's collected-by-partner report: what each partner's customers have paid us.
-- orders(id, partner, total), payments(id, order_id, amount)
SELECT o.partner, COALESCE(SUM(p.amount), 0) AS collected
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.partner
ORDER BY collected DESC, o.partner;
`;

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [
  {
    id: "collected-by-partner",
    key: "SQL-002",
    title: "Collected-by-partner report overstates split payments",
    summary: "Sum what was actually paid, and list partners who paid nothing.",
    difficulty: "easy",
    kind: "bug",
    language: "sql",
    skills: ["joins", "aggregation", "reconciliation"],
    schema:
      "CREATE TABLE orders (\n  id integer PRIMARY KEY,\n  partner text NOT NULL,\n  total numeric(12, 2) NOT NULL\n);\n\nCREATE TABLE payments (\n  id integer PRIMARY KEY,\n  order_id integer NOT NULL REFERENCES orders (id),\n  amount numeric(12, 2) NOT NULL\n);",
    task: `Rui sent this after reconciling September:

> The collected-by-partner report says Northwind paid us **$1,284.00** in September. Their remittances add up to **$942.00**. And Corvid isn't on the report at all. They're the one I need to chase: they haven't paid a cent since August.

Northwind moved its bigger customers onto two-part invoices in August, so some orders now have more than one payment, and some are only partly paid so far.

Fix the collected-by-partner query. It reads two tables:

| Table | Column | Type | Meaning |
| --- | --- | --- | --- |
| \`orders\` | \`id\` | \`integer\`, primary key | the order |
| \`orders\` | \`partner\` | \`text\`, not null | the partner the order came through |
| \`orders\` | \`total\` | \`numeric(12, 2)\`, not null | what the order was invoiced for |
| \`payments\` | \`id\` | \`integer\`, primary key | the payment |
| \`payments\` | \`order_id\` | \`integer\`, not null, references \`orders (id)\` | the order it pays for |
| \`payments\` | \`amount\` | \`numeric(12, 2)\`, not null | the amount received |

An order can have no payments, one, or several, and its payments need not add up to its total.

The query returns one row per partner that has at least one order, with two columns:

1. \`partner\`;
2. \`collected\`: the sum of every payment received on that partner's orders, or \`0\` when none of them has been paid.

Rows are ordered by \`collected\`, biggest first; partners with the same amount are in alphabetical order, so the PDF doesn't reshuffle every month. With no orders the result has no rows.

Requirement: every payment counts. Two payments of the same amount are two payments, so don't add up only the distinct amounts.`,
    entrypoint: "query",
    starter: COLLECTED_STARTER,
    inputs: [
      {"orders": [[1, "Northwind", 120.0]], "payments": [[1, 1, 120.0]]},
      {"orders": [[1, "Northwind", 500.0], [2, "Bluefin", 80.0]], "payments": [[1, 1, 250.0], [2, 1, 250.0], [3, 2, 80.0]]},
      {"orders": [[1, "Northwind", 90.0], [2, "Corvid", 45.0]], "payments": [[1, 1, 90.0]]},
      {"orders": [[1, "Northwind", 60.0], [2, "Bluefin", 60.0], [3, "Corvid", 75.0]], "payments": [[1, 1, 60.0], [2, 2, 60.0], [3, 3, 75.0]]},
      {"orders": [[1, "Bluefin", 100.0]], "payments": [[1, 1, 40.0]]},
      {"orders": [[1, "Northwind", 100.0]], "payments": [[1, 1, 50.0], [2, 1, 50.0]]},
      {"orders": [[1, "Bluefin", 30.0], [2, "Bluefin", 30.0]], "payments": [[1, 1, 30.0], [2, 2, 30.0]]},
      {"orders": [], "payments": []},
      {"orders": [[1, "Northwind", 300.0]], "payments": [[1, 1, 100.0], [2, 1, 100.0], [3, 1, 100.0]]},
      {"orders": [[1, "Northwind", 200.0], [2, "Northwind", 50.0], [3, "Northwind", 80.0], [4, "Bluefin", 400.0]], "payments": [[1, 1, 120.0], [2, 1, 80.0], [3, 3, 80.0]]},
      {"orders": [[1, "Corvid", 10.0], [2, "Bluefin", 20.0], [3, "Northwind", 30.0]], "payments": []},
      {"orders": [[1, "Northwind", 15.0], [2, "Bluefin", 25.0], [3, "Atlas", 5.0], [4, "Corvid", 8.0]], "payments": [[1, 4, 8.0]]},
      {"orders": [[1, "Bluefin", 0.3]], "payments": [[1, 1, 0.1], [2, 1, 0.2]]},
      {"orders": [[1, "Atlas", 10.0], [2, "Bluefin", 20.0], [3, "Corvid", 30.0], [4, "Delta", 40.0], [5, "Atlas", 35.0]], "payments": [[1, 1, 10.0], [2, 2, 20.0], [3, 2, 25.0], [4, 3, 30.0], [5, 4, 15.0], [6, 5, 35.0]]},
      {"orders": [[1, "Northwind", 100.0], [2, "Bluefin", 120.0]], "payments": [[1, 1, 60.0], [2, 1, 60.0], [3, 2, 120.0]]},
    ],
    expected: [
      [["Northwind", 120]],
      [["Northwind", 500], ["Bluefin", 80]],
      [["Northwind", 90], ["Corvid", 0]],
      [["Corvid", 75], ["Bluefin", 60], ["Northwind", 60]],
      [["Bluefin", 40]],
      [["Northwind", 100]],
      [["Bluefin", 60]],
      [],
      [["Northwind", 300]],
      [["Northwind", 280], ["Bluefin", 0]],
      [["Bluefin", 0], ["Corvid", 0], ["Northwind", 0]],
      [["Corvid", 8], ["Atlas", 0], ["Bluefin", 0], ["Northwind", 0]],
      [["Bluefin", 0.3]],
      [["Atlas", 45], ["Bluefin", 45], ["Corvid", 30], ["Delta", 15]],
      [["Bluefin", 120], ["Northwind", 120]],
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    comments: [],
    hints: [],
    team: [
      {
        id: "priya-sum-distinct",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: ["Every payment counts: two payments of the same amount are two payments, so don't add up only the distinct amounts."],
        when: {
          pattern: "[Ss][Uu][Mm]\\s*\\(\\s*[Dd][Ii][Ss][Tt][Ii][Nn][Cc][Tt]",
          present: true,
        },
        repeat: "while-true",
      },
    ],
    private: {
      reference: { "queries/collected-by-partner.sql": COLLECTED_REFERENCE },
      examples: {
        "priya-sum-distinct": {
          fires: [
            {
              "queries/collected-by-partner.sql": COLLECTED_REFERENCE.replace(
                "SUM(p.amount)",
                "SUM(DISTINCT p.amount)",
              ),
            },
            {
              "queries/collected-by-partner.sql": COLLECTED_REFERENCE.replace(
                "SUM(p.amount)",
                "sum( distinct p.amount)",
              ),
            },
          ],
          quiet: [{ "queries/collected-by-partner.sql": COLLECTED_REFERENCE }],
        },
      },
    },
  },
  {
    id: "dedupe-phone-customers",
    key: "PY-008",
    title: "Active customers report is short 212 customers",
    summary: "Monday's report lost 212 customers, all phone orders from the Leeds store.",
    difficulty: "medium",
    kind: "bug",
    language: "python",
    skills: ["debugging", "data-cleaning", "reading-code", "maps"],
    task: `Rui, first thing Monday:

> Monday's active-customers report says **18,406**. Last Monday it was **18,618**, and nobody closed 212 accounts over the weekend. I spot-checked three of the missing ones and they're all phone orders from the Leeds store:

\`\`\`text
id       name               email   phone
C-20931  Hollis Bakery              0113 496 0021
C-20977  Marsh & Daughters          0113 496 0088
C-21012  T. Okafor                  0113 496 0140
\`\`\`

The dedupe step was sped up on Tuesday: it used to compare every pair of records, which took 40 minutes on Northwind's 180k-row file, and now it makes one pass with a dict. This is the first Monday report since.

\`dedupe_customers(rows)\` takes the night's customer records (a list of dicts, each with fields such as \`id\`, \`name\`, \`email\` and \`phone\`; a field's value may be \`None\`) and returns one record per customer, in the order customers were first seen.

- Records whose emails match once normalised are the same customer. \`normalize_email(email)\` from \`pipeline.normalize\` (already imported) does the normalising: it returns the email trimmed of surrounding whitespace and lowercased, or \`None\` when there is no usable email (\`None\`, empty, or only whitespace). Phone and in-store customers often have none.
- For each customer, the first record is kept. A later duplicate only fills in fields the kept record left blank (\`None\` or \`""\`, or missing): each such field takes the duplicate's value, so the earliest later duplicate with a value wins. Nothing else changes; in particular the kept record's email stays as written.
- A record without a usable email can't be matched to anything, so it is always kept, as it is, in its place.
- The input rows (and their dicts) must not be changed. No rows gives \`[]\`.

The starter's \`_fill_blanks(customer, duplicate)\` already fills a kept record's blank fields from a duplicate, in place.

Requirement: keep it to one pass with a lookup by email. Don't compare each record against the customers kept so far: the nightly window is two hours.`,
    entry: "pipeline/dedupe.py",
    entrypoint: "dedupe_customers",
    starter: DEDUPE_STARTER,
    files: [
      {
        path: "pipeline/__init__.py",
        role: "read",
        language: "python",
        text: PIPELINE_INIT("Nightly customer pipeline: read partner exports, clean them, load the warehouse."),
      },
      { path: "pipeline/normalize.py", role: "read", language: "python", text: NORMALIZE },
    ],
    inputs: [
      [{"id": "C-1001", "name": "Ann Ives", "email": "Ann@Example.com", "phone": "0113 496 0001"}, {"id": "C-1002", "name": "Ann Ives", "email": " ann@example.com ", "phone": ""}, {"id": "C-1003", "name": "Bo Chen", "email": "bo@example.com", "phone": ""}],
      [{"id": "C-20931", "name": "Hollis Bakery", "email": null, "phone": "0113 496 0021"}, {"id": "C-20977", "name": "Marsh & Daughters", "email": "", "phone": "0113 496 0088"}, {"id": "C-21012", "name": "T. Okafor", "email": null, "phone": "0113 496 0140"}],
      [{"id": "C-3001", "name": "Cy Park", "email": "cy@example.com", "phone": ""}, {"id": "C-3002", "name": "Cyrus Park", "email": "CY@example.com", "phone": "0161 496 0302"}],
      [],
      [{"id": "C-4001", "name": "Dee Lam", "email": "dee@example.com", "phone": ""}, {"id": "C-4002", "name": "Leeds walk-in", "email": null, "phone": "0113 496 0400"}, {"id": "C-4003", "name": "Dee Lam", "email": "Dee@Example.com", "phone": "0113 496 0401"}, {"id": "C-4004", "name": "Eli Ross", "email": "eli@example.com", "phone": "0113 496 0402"}],
      [{"id": "C-5001", "name": "Fen Wu", "email": "   ", "phone": "0113 496 0500"}, {"id": "C-5002", "name": "Gus Hale", "email": null, "phone": "0113 496 0501"}, {"id": "C-5003", "name": "Hana Ito", "email": "\t", "phone": "0113 496 0502"}],
      [{"id": "C-6001", "name": "Ivy Stone", "email": null, "phone": ""}, {"id": "C-6002", "name": "Ivy Stone", "email": null, "phone": "0113 496 0600"}],
      [{"id": "C-7001", "name": "Jo Kim", "email": "jo@example.com", "phone": "0113 496 0700"}],
      [{"id": "C-8001", "name": "Kai Bell", "email": "kai@example.com", "phone": null, "city": ""}, {"id": "C-8002", "name": "Kai Bell", "email": "KAI@example.com", "phone": "0113 496 0800", "city": ""}, {"id": "C-8003", "name": "K. Bell", "email": "kai@example.com ", "phone": "0113 496 0899", "city": "Leeds"}],
      [{"id": "C-9001", "name": "Lou Ng", "email": "lou@example.com", "phone": "0113 496 0900"}, {"id": "C-9002", "name": "Louise Ng", "email": "lou@example.com", "phone": "0113 496 0999"}],
      [{"id": "C-9101", "name": "Mo Diaz", "email": "  Mo@Example.COM ", "phone": ""}, {"id": "C-9102", "name": "Mo Diaz", "email": "mo@example.com", "phone": "0113 496 0910"}],
      [{"id": "C-9201", "name": "Leeds phone order 1", "email": null, "phone": "0113 496 0901"}, {"id": "C-9202", "name": "Leeds phone order 2", "email": "", "phone": "0113 496 0902"}, {"id": "C-9203", "name": "Leeds phone order 3", "email": null, "phone": "0113 496 0903"}, {"id": "C-9204", "name": "Leeds phone order 4", "email": " ", "phone": "0113 496 0904"}, {"id": "C-9205", "name": "Leeds phone order 5", "email": null, "phone": "0113 496 0905"}, {"id": "C-9206", "name": "Leeds phone order 6", "email": "", "phone": "0113 496 0906"}],
      [{"id": "C-9301", "name": "Nia Shaw", "email": null, "phone": "0113 496 0930"}, {"id": "C-9302", "name": "Nia Shaw", "email": "nia@example.com", "phone": ""}, {"id": "C-9303", "name": "Nia Shaw", "email": "NIA@example.com", "phone": "0113 496 0931"}],
      [{"id": "C-9401", "name": "Oli Gray", "email": "oli@example.com", "phone": ""}, {"id": "C-9402", "name": "Shop till", "email": null, "phone": ""}, {"id": "C-9403", "name": "Shop till", "email": null, "phone": ""}, {"id": "C-9404", "name": "Shop till", "email": "", "phone": ""}, {"id": "C-9405", "name": "Oliver Gray", "email": "oli@example.com", "phone": "0113 496 0940"}],
      [{"id": "C-9501", "name": "Pat Roe", "email": "pat@example.com", "phone": ""}, {"id": "C-9502", "name": "Pat Roe", "email": "pat@example.co", "phone": "0113 496 0950"}],
      [{"id": "C-9601", "name": "Quin Hart", "email": "quin@example.com", "phone": ""}, {"id": "C-9602", "name": "", "email": "Quin@example.com", "phone": ""}, {"id": "C-9603", "name": "Quin Hart", "email": "quin@example.com", "phone": "0113 496 0960"}],
    ],
    expected: [
      [{"id": "C-1001", "name": "Ann Ives", "email": "Ann@Example.com", "phone": "0113 496 0001"}, {"id": "C-1003", "name": "Bo Chen", "email": "bo@example.com", "phone": ""}],
      [{"id": "C-20931", "name": "Hollis Bakery", "email": null, "phone": "0113 496 0021"}, {"id": "C-20977", "name": "Marsh & Daughters", "email": "", "phone": "0113 496 0088"}, {"id": "C-21012", "name": "T. Okafor", "email": null, "phone": "0113 496 0140"}],
      [{"id": "C-3001", "name": "Cy Park", "email": "cy@example.com", "phone": "0161 496 0302"}],
      [],
      [{"id": "C-4001", "name": "Dee Lam", "email": "dee@example.com", "phone": "0113 496 0401"}, {"id": "C-4002", "name": "Leeds walk-in", "email": null, "phone": "0113 496 0400"}, {"id": "C-4004", "name": "Eli Ross", "email": "eli@example.com", "phone": "0113 496 0402"}],
      [{"id": "C-5001", "name": "Fen Wu", "email": "   ", "phone": "0113 496 0500"}, {"id": "C-5002", "name": "Gus Hale", "email": null, "phone": "0113 496 0501"}, {"id": "C-5003", "name": "Hana Ito", "email": "\t", "phone": "0113 496 0502"}],
      [{"id": "C-6001", "name": "Ivy Stone", "email": null, "phone": ""}, {"id": "C-6002", "name": "Ivy Stone", "email": null, "phone": "0113 496 0600"}],
      [{"id": "C-7001", "name": "Jo Kim", "email": "jo@example.com", "phone": "0113 496 0700"}],
      [{"id": "C-8001", "name": "Kai Bell", "email": "kai@example.com", "phone": "0113 496 0800", "city": "Leeds"}],
      [{"id": "C-9001", "name": "Lou Ng", "email": "lou@example.com", "phone": "0113 496 0900"}],
      [{"id": "C-9101", "name": "Mo Diaz", "email": "  Mo@Example.COM ", "phone": "0113 496 0910"}],
      [{"id": "C-9201", "name": "Leeds phone order 1", "email": null, "phone": "0113 496 0901"}, {"id": "C-9202", "name": "Leeds phone order 2", "email": "", "phone": "0113 496 0902"}, {"id": "C-9203", "name": "Leeds phone order 3", "email": null, "phone": "0113 496 0903"}, {"id": "C-9204", "name": "Leeds phone order 4", "email": " ", "phone": "0113 496 0904"}, {"id": "C-9205", "name": "Leeds phone order 5", "email": null, "phone": "0113 496 0905"}, {"id": "C-9206", "name": "Leeds phone order 6", "email": "", "phone": "0113 496 0906"}],
      [{"id": "C-9301", "name": "Nia Shaw", "email": null, "phone": "0113 496 0930"}, {"id": "C-9302", "name": "Nia Shaw", "email": "nia@example.com", "phone": "0113 496 0931"}],
      [{"id": "C-9401", "name": "Oli Gray", "email": "oli@example.com", "phone": "0113 496 0940"}, {"id": "C-9402", "name": "Shop till", "email": null, "phone": ""}, {"id": "C-9403", "name": "Shop till", "email": null, "phone": ""}, {"id": "C-9404", "name": "Shop till", "email": "", "phone": ""}],
      [{"id": "C-9501", "name": "Pat Roe", "email": "pat@example.com", "phone": ""}, {"id": "C-9502", "name": "Pat Roe", "email": "pat@example.co", "phone": "0113 496 0950"}],
      [{"id": "C-9601", "name": "Quin Hart", "email": "quin@example.com", "phone": "0113 496 0960"}],
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    comments: [],
    hints: [],
    team: [
      {
        id: "priya-pairwise",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: ["Keep it to one pass with a lookup by email: don't compare each record against the customers kept so far."],
        when: {
          any: [
            {
              pattern:
                "^\\s+for \\w+ in (customers|kept|seen|result|results|out|output|deduped|unique)\\b",
              present: true,
              file: "pipeline/dedupe.py",
            },
            { pattern: "\\bany\\(", present: true, file: "pipeline/dedupe.py" },
            { pattern: "in range\\(len\\(", present: true, file: "pipeline/dedupe.py" },
          ],
        },
        repeat: "while-true",
      },
    ],
    private: {
      reference: { "pipeline/dedupe.py": DEDUPE_REFERENCE },
      alternatives: [
        // Keep the dict, but give each record without an email a key nothing else can share.
        {
          "pipeline/dedupe.py": DEDUPE_STARTER.replace(
            '        key = normalize_email(row.get("email"))\n',
            '        key = normalize_email(row.get("email"))\n        if key is None:\n            key = ("no email", len(customers))\n',
          ),
        },
      ],
      wrong: [
        // Leaves the records without an email out altogether.
        {
          "pipeline/dedupe.py": DEDUPE_STARTER.replace(
            '        key = normalize_email(row.get("email"))\n',
            '        key = normalize_email(row.get("email"))\n        if key is None:\n            continue\n',
          ),
        },
        // Keys the records without an email by name, merging two walk-ins with the same name.
        {
          "pipeline/dedupe.py": DEDUPE_STARTER.replace(
            '        key = normalize_email(row.get("email"))\n',
            '        key = normalize_email(row.get("email")) or row.get("name")\n',
          ),
        },
      ],
      examples: {
        "priya-pairwise": {
          fires: [{ "pipeline/dedupe.py": `from pipeline.normalize import normalize_email


def _fill_blanks(customer, duplicate):
    """Fields the first record left blank are taken from a later duplicate."""
    for field, value in duplicate.items():
        if customer.get(field) in (None, ""):
            customer[field] = value


def dedupe_customers(rows):
    """One record per customer, in the order customers were first seen.

    Records whose emails match after normalising are the same customer: the first one is
    kept, and later duplicates only fill in fields it left blank. A record without an email
    cannot be matched to anything, so it is always kept as it is. Input rows are not changed.
    """
    customers = []
    for row in rows:
        key = normalize_email(row.get("email"))
        match = None
        for customer in customers:
            if key is not None and normalize_email(customer.get("email")) == key:
                match = customer
                break
        if match is None:
            customers.append(dict(row))
        else:
            _fill_blanks(match, row)
    return customers
` }],
          quiet: [{ "pipeline/dedupe.py": DEDUPE_REFERENCE }, {}],
        },
      },
    },
  },
  {
    id: "bracketed-refunds",
    key: "PY-010",
    title: "Bluefin settlements don't match their statements",
    summary: "Bluefin's new export writes refunds and fees in brackets; the report loses or misreads them.",
    difficulty: "hard",
    kind: "bug",
    language: "python",
    skills: ["debugging", "parsing", "money", "reading-code"],
    task: `Rui escalated Bluefin's October reconciliation:

> Bluefin's statement for 3 October says we're owed **€59.50** on 2 orders. Our settlement report says **€75.00** with **2 rejected rows**. Every night since 1 October has had rejected rows, always Bluefin's. Northwind still matches to the cent.

Bluefin's partner note from 28 September:

> From 1 October our settlement exports write negative amounts in accounting format: refunds and fees appear in brackets, e.g. \`(12.50)\`.

Their file for 3 October:

\`\`\`text
partner,order_id,type,amount,currency
Bluefin,BF-77101,sale,45.00,EUR
Bluefin,BF-77102,sale,30.00,EUR
Bluefin,BF-77101,refund,(12.50),EUR
Bluefin,BF-FEE-10,adjustment,(3.00),EUR
\`\`\`

\`settlement_summary(text)\` is what finance reconciles each partner's statement against. It takes a settlement export as CSV text, with the header \`partner,order_id,type,amount,currency\`, and returns \`{"partners": [...], "rejected": n}\`.

**Reading rows.** Each row of the export is read as follows. (In the starter, \`read_settlements(text)\` does the reading; only \`settlement_summary\`'s result is checked.)

- \`partner\` and \`order\` are trimmed; \`currency\` is trimmed and upper-cased.
- The type is trimmed and lower-cased, and must be \`sale\`, \`refund\` or \`adjustment\`; any other type rejects the row.
- An amount is read in whole cents. A plain amount is read by \`to_cents(text)\` from \`pipeline.money\` (already imported): a decimal number with an optional sign and at most two decimal places, with surrounding whitespace allowed (\`"12.50"\`, \`"-3"\`, \`" 7.05 "\`), becomes cents (\`1250\`, \`-300\`, \`705\`); anything else, including an empty string, \`NaN\` or more than two decimal places, raises \`ValueError\`. An amount in brackets, with surrounding whitespace allowed, is an accounting negative: \`(12.50)\` is \`-1250\`. What's inside the brackets must itself be a plain amount.
- A row whose amount can't be read is rejected: counted and left out, never guessed at. Only a bad type or a bad amount rejects a row; anything else wrong with the file (a missing column, say) is an error, not a rejected row.

**Summary.** One entry per partner and currency, as \`{"partner", "currency", "sales", "refunds", "net"}\`, sorted by partner and then currency:

- \`sales\` and \`refunds\` count the rows of each kind (adjustments aren't counted).
- \`net\` in cents is sales less refunds, plus adjustments (fees, corrections) with their own sign. A refund always reduces net by its size, whichever way the partner writes it: Northwind writes refunds as positive amounts, Bluefin in brackets.

\`rejected\` is the number of rejected rows, so nobody signs off on a partial file. A file with only the header gives \`{"partners": [], "rejected": 0}\`.`,
    entry: "pipeline/report.py",
    entrypoint: "settlement_summary",
    starter: REPORT_STARTER,
    files: [
      {
        path: "pipeline/__init__.py",
        role: "read",
        language: "python",
        text: PIPELINE_INIT("Nightly settlement pipeline: read partner exports, load the warehouse, report to finance."),
      },
      { path: "pipeline/money.py", role: "read", language: "python", text: MONEY },
    ],
    inputs: [
      "partner,order_id,type,amount,currency\nNorthwind,NW-1001,sale,120.00,USD\nNorthwind,NW-1002,sale,80.50,USD\nNorthwind,NW-1001,refund,20.00,USD\nNorthwind,NW-ADJ-9,adjustment,-3.00,USD\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-77101,sale,45.00,EUR\nBluefin,BF-77102,sale,30.00,EUR\nBluefin,BF-77101,refund,(12.50),EUR\nBluefin,BF-FEE-10,adjustment,(3.00),EUR\n",
      "partner,order_id,type,amount,currency\nNorthwind,NW-2001,sale,60.00,USD\nBluefin,BF-78001,sale,100.00,EUR\nBluefin,BF-78001,refund,(25.00),EUR\nNorthwind,NW-2001,refund,15.00,USD\nBluefin,BF-FEE-11,adjustment,(1.50),EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-79001,sale,10.00,EUR\nBluefin,BF-79002,sale,n/a,EUR\nBluefin,BF-79001,chargeback,(10.00),EUR\nBluefin,BF-79003,sale,22.00,EUR\n",
      "partner,order_id,type,amount,currency\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-80001,sale,50.00,EUR\nBluefin,BF-ADJ-1,adjustment,3.00,EUR\nBluefin,BF-FEE-12,adjustment,(0.05),EUR\n",
      "partner,order_id,type,amount,currency\nCorvid,CV-1,sale,40.00,GBP\nCorvid,CV-1,refund,-4.00,GBP\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-81001,sale,10.00,EUR\nBluefin,BF-81001,refund,(),EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-82001,sale,10.00,EUR\nBluefin,BF-82001,refund,(abc),EUR\nBluefin,BF-82002,refund,(5.00,EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-83001,sale,20.00,EUR\nBluefin,BF-83001,refund, (12.50) ,EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-84001,sale,10.00,USD\nBluefin,BF-84002,sale,30.00,EUR\nBluefin,BF-84002,refund,(30.00),EUR\nBluefin,BF-84001,refund,(2.00),usd\n",
      "partner,order_id,type,amount,currency\nNorthwind,NW-3001,refund,9.99,USD\nBluefin,BF-85001,refund,(9.99),EUR\n",
      "partner,order_id,type,amount,currency\nNorthwind,NW-4001, Sale ,10.00,USD\nNorthwind,NW-4001, REFUND,1.00,USD\nBluefin,BF-86001,Refund,(1.00),EUR\nBluefin,BF-86002,Adjustment,(0.50),EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-87001,refund,(NaN),EUR\nBluefin,BF-87002,sale,NaN,EUR\nBluefin,BF-87003,sale,12.345,EUR\nBluefin,BF-87004,sale,(12.345),EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-88001,sale,0.10,EUR\nBluefin,BF-88001,refund,(0.00),EUR\nBluefin,BF-FEE-13,adjustment,(0.00),EUR\n",
      "partner,order_id,type,amount,currency\nBluefin,BF-89001,sale,1.25,EUR\nBluefin,BF-89002,sale,2.25,EUR\nBluefin,BF-89003,sale,3.25,EUR\nBluefin,BF-89004,sale,4.25,EUR\nBluefin,BF-89005,sale,5.25,EUR\nBluefin,BF-89001,refund,(1.25),EUR\nBluefin,BF-89002,refund,(2.25),EUR\nBluefin,BF-89003,refund,(3.25),EUR\nBluefin,BF-FEE-14,adjustment,(2.40),EUR\nBluefin,BF-ADJ-15,adjustment,1.10,EUR\n",
    ],
    expected: [
      {"partners": [{"partner": "Northwind", "currency": "USD", "sales": 2, "refunds": 1, "net": 17750}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 2, "refunds": 1, "net": 5950}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 1, "net": 7350}, {"partner": "Northwind", "currency": "USD", "sales": 1, "refunds": 1, "net": 4500}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 2, "refunds": 0, "net": 3200}], "rejected": 2},
      {"partners": [], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 0, "net": 5295}], "rejected": 0},
      {"partners": [{"partner": "Corvid", "currency": "GBP", "sales": 1, "refunds": 1, "net": 3600}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 0, "net": 1000}], "rejected": 1},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 0, "net": 1000}], "rejected": 2},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 1, "net": 750}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 1, "net": 0}, {"partner": "Bluefin", "currency": "USD", "sales": 1, "refunds": 1, "net": 800}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 0, "refunds": 1, "net": -999}, {"partner": "Northwind", "currency": "USD", "sales": 0, "refunds": 1, "net": -999}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 0, "refunds": 1, "net": -150}, {"partner": "Northwind", "currency": "USD", "sales": 1, "refunds": 1, "net": 900}], "rejected": 0},
      {"partners": [], "rejected": 4},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 1, "refunds": 1, "net": 10}], "rejected": 0},
      {"partners": [{"partner": "Bluefin", "currency": "EUR", "sales": 5, "refunds": 3, "net": 820}], "rejected": 0},
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    comments: [],
    hints: [],
    private: {
      reference: { "pipeline/report.py": REPORT_REFERENCE },
      alternatives: [
        // Brackets read inline in the reader, and the report subtracts a refund's size whichever
        // its sign.
        {
          "pipeline/report.py": REPORT_STARTER.replace(
            '        try:\n            amount = to_cents(raw["amount"])',
            '        written = raw["amount"].strip()\n        sign = 1\n        if len(written) > 2 and written[0] == "(" and written[-1] == ")":\n            sign, written = -1, written[1:-1]\n        try:\n            amount = sign * to_cents(written)',
          ).replace(
            '            total["net"] -= row["amount"]',
            '            total["net"] -= row["amount"] if row["amount"] > 0 else -row["amount"]',
          ),
        },
      ],
      wrong: [
        // Brackets read, but a bracketed refund now adds to net instead of reducing it.
        { "pipeline/report.py": READER_REFERENCE + "\n\n" + SUMMARY_STARTER },
        // abs() in the reader: Bluefin's fees turn into credits.
        {
          "pipeline/report.py": REPORT_REFERENCE.replace(
            '            amount = parse_amount(raw["amount"])',
            '            amount = abs(parse_amount(raw["amount"]))',
          ),
        },
        // Strips the brackets and keeps the number positive.
        {
          "pipeline/report.py": READER_STARTER.replace(
            '            amount = to_cents(raw["amount"])',
            '            amount = to_cents(raw["amount"].strip().strip("()"))',
          ) + "\n\n" + SUMMARY_REFERENCE,
        },
      ],
    },
  },
];
