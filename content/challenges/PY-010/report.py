import csv
import io
from decimal import Decimal, InvalidOperation


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


# ---- money: helpers this code uses. You shouldn't need to change them. ----

# Money is whole cents everywhere: never floats.


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
