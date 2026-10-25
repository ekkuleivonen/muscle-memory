

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
