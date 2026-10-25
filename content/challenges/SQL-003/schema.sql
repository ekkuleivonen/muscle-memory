CREATE TABLE orders (
  id integer PRIMARY KEY,
  customer text NOT NULL
);

CREATE TABLE payments (
  order_id integer NOT NULL REFERENCES orders (id),
  amount integer NOT NULL
);
