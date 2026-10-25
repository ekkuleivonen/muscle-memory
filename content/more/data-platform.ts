import type { SeedIssue } from "../seed";
import { priya, rui } from "../team";

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

const READERS_STARTER = `import csv
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

const READERS_REFERENCE = `import csv
import io

from pipeline.money import to_cents

KINDS = {"sale", "refund", "adjustment"}


def parse_amount(text):
    """A plain amount, or an accounting negative in brackets: (12.50) is -12.50."""
    text = text.strip()
    if text.startswith("(") and text.endswith(")"):
        return -to_cents(text[1:-1])
    return to_cents(text)


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
            amount = parse_amount(raw["amount"])
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

const REPORT_STARTER = `from pipeline.readers import read_settlements


def settlement_summary(text):
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

const REPORT_REFERENCE = `from pipeline.readers import read_settlements


def settlement_summary(text):
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
            # Partners write refunds either way round; a refund always gives money back.
            total["net"] -= abs(row["amount"])
        else:
            total["net"] += row["amount"]
    return {"partners": [totals[key] for key in sorted(totals)], "rejected": rejected}
`;

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

The report is \`queries/collected-by-partner.sql\`. It should give one row per partner that has orders: the partner and what has been collected on its orders, which is the sum of the payments received, or 0 when nothing has been paid. Biggest first; partners with the same amount in alphabetical order, so the PDF doesn't reshuffle every month.`,
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
    comments: [
      rui(
        "The September pack goes to the board on Thursday. I'd rather not explain a $342 gap to them.",
      ),
    ],
    hints: [
      "Pick an order with two payments and write out the rows the join gives you for it. What does each row carry, and what gets added up?",
      {
        text: "Corvid has orders but no payments. Which kind of join still gives you a row for an order nothing matched?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "priya-sum-distinct",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: [
          "`DISTINCT` inside the sum drops a payment whenever two are the same amount, and Northwind's two-part invoices are usually two equal halves. Can we add up every payment instead?",
          "Two installments of $250.00 are two payments, but `SUM(DISTINCT ...)` counts one of them. Could this sum every payment row?",
        ],
        when: {
          pattern: "[Ss][Uu][Mm]\\s*\\(\\s*[Dd][Ii][Ss][Tt][Ii][Nn][Cc][Tt]",
          present: true,
        },
        repeat: "while-true",
      },
      {
        id: "rui-northwind",
        author: "Rui F",
        role: "Finance",
        where: "review",
        severity: "info",
        text: ["That's Northwind's two-part invoices counted once. Matches their remittances."],
        when: { check: "case-2", is: "passing" },
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
    title: "Active customers report is short 212 customers",
    summary: "The faster dedupe step merges customers it should keep apart.",
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

Priya sped up the dedupe step on Tuesday: it used to compare every pair of records, which took 40 minutes on Northwind's 180k-row file, and now it makes one pass with a dict. This is the first Monday report since.

\`dedupe_customers(rows)\` in \`pipeline/dedupe.py\` turns the night's customer records into one record per customer, in the order customers were first seen. Records whose emails match once normalised (\`pipeline/normalize.py\`) are the same customer: the first record is kept, and later duplicates only fill in fields it left blank. A record without an email can't be matched to anything, so it is always kept as it is. The input rows must not be changed. Keep it to one pass.`,
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
    comments: [
      priya(
        "That'll be my change, sorry. Please don't put the pairwise loop back, though: the nightly window is two hours and Northwind's file alone took 40 minutes with it.",
      ),
      rui("The report goes to the regional managers at 11. Leeds will notice first."),
    ],
    hints: [
      {
        text: "Take one of Rui's three customers through the loop by hand. What key does it get, and which other records end up with the same key?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 12 },
      },
      {
        text: "Read what normalising says about records with no usable email. Should two of those ever count as the same customer?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "priya-pairwise",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: [
          "This looks like it compares each record against every customer kept so far, which is the 40-minute version again. Could the lookup stay a dict, one pass over the rows?",
          "Scanning the kept customers for every row puts us back to quadratic, and Northwind's file won't finish in the nightly window. Can we keep the one-pass lookup?",
        ],
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
      {
        id: "priya-long-dedupe",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "nit",
        text: ["Nit: `dedupe_customers` has grown a fair bit. Is there a smaller change that does it?"],
        when: { metric: "function-lines", above: 30, file: "pipeline/dedupe.py" },
      },
      {
        id: "rui-leeds",
        author: "Rui F",
        role: "Finance",
        where: "review",
        severity: "info",
        text: ["Hollis Bakery, Marsh & Daughters and T. Okafor are all back in the test data. Thanks."],
        when: { check: "case-2", is: "passing" },
      },
    ],
    private: {
      reference: { "pipeline/dedupe.py": DEDUPE_REFERENCE },
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

\`settlement_summary(text)\` in \`pipeline/report.py\` is what finance reconciles against: per partner and currency, the number of sales and refunds and the net in cents, plus how many rows were rejected. Net is sales less refunds, plus adjustments with their own sign. A refund always reduces net by its amount, whichever way a partner writes it: Northwind writes refunds as positive amounts. \`read_settlements\` in \`pipeline/readers.py\` also loads \`raw_settlements\` in the warehouse, so its rows keep amounts signed as the partner wrote them. A row that still can't be read is rejected and counted, not guessed at.`,
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
      { path: "pipeline/readers.py", role: "edit", language: "python", text: READERS_STARTER },
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
    comments: [
      priya(
        "Heads up that `raw_settlements` is what we send back to partners when they dispute a night, so whatever the reader gives it has to read like their file.",
      ),
      rui("I've held Bluefin's October payout until the report and their statements agree."),
    ],
    hints: [
      {
        text: "Rui's rejected rows started on 1 October. Find where a row gets turned away, and try one of Bluefin's amounts there.",
        when: { behaviour: "active-minutes-without-progress", atLeast: 12 },
      },
      {
        text: "Once Bluefin's refunds get through, follow one into the report next to one of Northwind's. Does net move the same way for both?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "priya-reader-sign",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: [
          "`abs()` in the reader changes what lands in `raw_settlements`: Bluefin's fees would show up there as credits. Can the reader keep the sign as written and leave what a refund means to the report?",
          "The reader's rows are what we send back when a partner disputes a night, so they need the partner's own signs. Could the `abs()` move out of the reader?",
        ],
        when: { pattern: "\\babs\\(", present: true, file: "pipeline/readers.py" },
        repeat: "while-true",
      },
      {
        id: "mateo-catch-all",
        author: "Mateo O",
        role: "Backend",
        where: "review",
        severity: "nit",
        text: [
          "Nit: catching everything here would also count a file with a missing column as rejected rows. Could it stay with the error you expect?",
        ],
        when: {
          pattern: "except(\\s+(Exception|BaseException))?\\s*(as \\w+)?:",
          present: true,
          file: "pipeline/readers.py",
        },
      },
      {
        id: "rui-bluefin",
        author: "Rui F",
        role: "Finance",
        where: "review",
        severity: "info",
        text: ["€59.50, no rejected rows. That's Bluefin's 3 October statement to the cent."],
        when: { check: "case-2", is: "passing" },
      },
    ],
    private: {
      reference: { "pipeline/readers.py": READERS_REFERENCE, "pipeline/report.py": REPORT_REFERENCE },
      examples: {
        "priya-reader-sign": {
          fires: [{ "pipeline/readers.py": `import csv
import io

from pipeline.money import to_cents

KINDS = {"sale", "refund", "adjustment"}


def parse_amount(text):
    """A plain amount, or an accounting negative in brackets: (12.50) is -12.50."""
    text = text.strip()
    if text.startswith("(") and text.endswith(")"):
        return -abs(to_cents(text[1:-1]))
    return to_cents(text)


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
            amount = parse_amount(raw["amount"])
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
` }],
          quiet: [{ "pipeline/readers.py": READERS_REFERENCE }, { "pipeline/report.py": REPORT_REFERENCE }],
        },
      },
    },
  },
];
