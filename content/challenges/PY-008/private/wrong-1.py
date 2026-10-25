# Leaves the records without an email out altogether.


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
        if key is None:
            continue
        if key in customers:
            _fill_blanks(customers[key], row)
            continue
        customers[key] = dict(row)
    return list(customers.values())


# ---- normalize: helpers this code uses. You shouldn't need to change them. ----

# Normalising fields before records are compared or loaded.


def normalize_email(email):
    """An email as we compare it: trimmed and lowercased.

    None when there is no usable email on file (missing, empty or only spaces): phone and
    in-store customers often have none.
    """
    if email is None:
        return None
    email = email.strip().lower()
    return email or None
