CREATE TABLE orders (
  id integer PRIMARY KEY,
  partner text NOT NULL,
  total numeric(12, 2) NOT NULL
);

CREATE TABLE payments (
  id integer PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id),
  amount numeric(12, 2) NOT NULL
);
