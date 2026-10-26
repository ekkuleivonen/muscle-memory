def _fill_blanks(customer, duplicate):
    """Fields the first record left blank are taken from a later duplicate."""
    for field, value in duplicate.items():
        if customer.get(field) in (None, ""):
            customer[field] = value


def dedupe_customers(rows):
    customers = {}
    result = []
    for row in rows:
        key = normalize_email(row.get("email"))
        if key is not None and key in customers:
            _fill_blanks(customers[key], row)
            continue
        customer = dict(row)
        result.append(customer)
        if key is not None:
            customers[key] = customer
    return result

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
