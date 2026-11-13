CREATE TABLE IF NOT EXISTS buy_updates (
  slug TEXT PRIMARY KEY REFERENCES buys(slug),
  shipping_cents INTEGER CHECK(shipping_cents BETWEEN 0 AND 100000000),
  pickup_details TEXT NOT NULL DEFAULT '',
  organizer_note TEXT NOT NULL DEFAULT ''
);
