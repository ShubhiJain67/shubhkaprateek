-- One-time: adds the 3 Samvardhan Mart enquiries (from the form emails) to the dashboard's database.
-- Run from bot/:  npx wrangler d1 execute skp-stats --remote --file=import-enquiries.sql
CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, updated TEXT, status TEXT,
  brand TEXT, email TEXT, package TEXT, product_link TEXT, message TEXT, price TEXT, payment TEXT, product_value TEXT,
  shoot_by TEXT, post_by TEXT, contact TEXT, notes TEXT, product_ids TEXT, reel_code TEXT);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER, at TEXT, text TEXT);
INSERT INTO enquiries (created, updated, status, brand, email, package, product_link, message, price, payment, product_ids) VALUES
  ('2026-11-03T20:00:00Z', '2026-11-03T20:00:00Z', 'new', 'Samvardhan Mart', 'sanchitonline2019@gmail.com', 'Option 1 — Basic Reel Collaboration', 'https://amzn.in/d/00pYBaL8', '', '₹1,500', 'Paid', '[]'),
  ('2026-11-03T20:00:01Z', '2026-11-03T20:00:01Z', 'new', 'Samvardhan Mart', 'sanchitonline2019@gmail.com', 'Option 3 — Featured Brand Collaboration', 'https://amzn.in/d/0fPZMw9q', '', '₹4,000', 'Paid', '[]'),
  ('2026-11-03T20:00:02Z', '2026-11-03T20:00:02Z', 'new', 'Samvardhan Mart', 'sanchitonline2019@gmail.com', 'Option 1 — Basic Reel Collaboration', 'https://amzn.in/d/0gBzCmIt', '', '₹1,500', 'Paid', '[]');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, created, 'Enquiry received (imported from the form email)' FROM enquiries WHERE email = 'sanchitonline2019@gmail.com' AND id NOT IN (SELECT enquiry_id FROM events);
