-- One-time: past collabs, added to the dashboard for the record (no website pages are created or changed).
-- First: make ship, open shubhkaprateek.com/admin once (that adds the new columns). Then from bot/:
--   npx wrangler d1 execute skp-stats --remote --file=import-past.sql
-- Safe to run twice: a deal that's already there is skipped.

-- Eazy Arts — barter, reel DV2XLW2EuoN (Paint-your-own portrait kit, product 1)
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,source,received_on,draft_on,live_on,collab_on,deliverables,product_ids,reel_code,notes)
  SELECT 'https://eazyarts.in/products/custom-paint-by-numbers?variant=50446403698755', '2026-02-24T06:30:00Z','2026-03-14T12:30:00Z','delivered','Eazy Arts','','Barter','','Barter','₹3,500','[{"name": "Ayushi", "role": "Marketing", "phone": "+91 81475 37032"}]','','us','2026-03-07','2026-03-12','2026-03-14','2026-03-14','{"items": {"reel": {"on": true, "done": true, "count": 1}, "mention": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "raw": {"on": true, "done": true}, "rights": {"on": false, "done": false}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "collab": {"on": true, "done": true}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}}, "extra": [{"t": "Final edited video shared", "done": true}]}','[1]','DV2XLW2EuoN','Imported for the record. Shared raw clips + final video; closed on 14 Mar.'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-02-24T06:30:00Z', 'Imported — we reached out' FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-02-24T06:31:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-03-14T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN' AND id NOT IN (SELECT enquiry_id FROM events);

-- Brickadda — 3 barter collabs (one per reel), ₹1,000 product each. Reached out 30 Aug for Prateek's birthday series; all 3 sets dispatched 7 Sep, received 17 Sep.
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,instagram,source,dispatched_on,received_on,live_on,collab_on,deliverables,product_ids,reel_code,notes)
  SELECT 'https://brickadda.com/products/gamma-monster', '2026-08-30T06:30:00Z','2026-09-25T12:30:00Z','delivered','Brickadda','','Barter','','Barter','₹1,000','[{"name": "Manav", "role": "Owner", "phone": "+91 6354 999 647"}]','','@brickadda','us','2026-09-07','2026-09-17','2026-09-25','2026-09-25','{"items": {"mention": {"on": false, "done": false}, "raw": {"on": false, "done": false}, "rights": {"on": false, "done": false}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "reel": {"on": true, "done": true, "count": 1}, "collab": {"on": true, "done": true}}, "extra": []}','[18]','DdrMH5JSjEz','Imported for the record. Hulk BrickSet — 1 of 3 Brickadda collabs (Prateek''s birthday series).'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DdrMH5JSjEz');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-08-30T06:30:00Z', 'Imported — we reached out' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DdrMH5JSjEz' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-08-31T06:30:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DdrMH5JSjEz' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-09-25T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DdrMH5JSjEz' AND id NOT IN (SELECT enquiry_id FROM events);
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,instagram,source,dispatched_on,received_on,live_on,collab_on,deliverables,product_ids,reel_code,notes)
  SELECT 'https://brickadda.com/products/the-web-crawler', '2026-08-30T06:30:00Z','2026-10-04T12:30:00Z','delivered','Brickadda','','Barter','','Barter','₹1,000','[{"name": "Manav", "role": "Owner", "phone": "+91 6354 999 647"}]','','@brickadda','us','2026-09-07','2026-09-17','2026-10-04','2026-10-04','{"items": {"mention": {"on": false, "done": false}, "raw": {"on": false, "done": false}, "rights": {"on": false, "done": false}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "reel": {"on": true, "done": true, "count": 1}, "collab": {"on": true, "done": true}}, "extra": []}','[27]','DeCzq_uyf92','Imported for the record. Spider-Man brick set — 1 of 3 Brickadda collabs (Prateek''s birthday series).'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeCzq_uyf92');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-08-30T06:30:00Z', 'Imported — we reached out' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeCzq_uyf92' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-08-31T06:30:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeCzq_uyf92' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-04T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeCzq_uyf92' AND id NOT IN (SELECT enquiry_id FROM events);
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,instagram,source,dispatched_on,received_on,live_on,collab_on,deliverables,product_ids,reel_code,notes)
  SELECT 'https://brickadda.com/products/the-mark-one', '2026-08-30T06:30:00Z','2026-10-14T12:30:00Z','delivered','Brickadda','','Barter','','Barter','₹1,000','[{"name": "Manav", "role": "Owner", "phone": "+91 6354 999 647"}]','','@brickadda','us','2026-09-07','2026-09-17','2026-10-14','2026-10-14','{"items": {"mention": {"on": false, "done": false}, "raw": {"on": false, "done": false}, "rights": {"on": false, "done": false}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "reel": {"on": true, "done": true, "count": 1}, "collab": {"on": true, "done": true}}, "extra": []}','[38]','DeccYpmSfkN','Imported for the record. Iron Man building-block figure — 1 of 3 Brickadda collabs (Prateek''s birthday series).'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeccYpmSfkN');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-08-30T06:30:00Z', 'Imported — we reached out' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeccYpmSfkN' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-08-31T06:30:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeccYpmSfkN' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-14T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Brickadda' AND reel_code = 'DeccYpmSfkN' AND id NOT IN (SELECT enquiry_id FROM events);

-- Product links (the buy links live on the website) — also fills them in if you already ran this file before
UPDATE enquiries SET product_link = 'https://eazyarts.in/products/custom-paint-by-numbers?variant=50446403698755' WHERE reel_code = 'DV2XLW2EuoN' AND (product_link IS NULL OR product_link = '');
UPDATE enquiries SET product_link = 'https://brickadda.com/products/gamma-monster' WHERE reel_code = 'DdrMH5JSjEz' AND (product_link IS NULL OR product_link = '');
UPDATE enquiries SET product_link = 'https://brickadda.com/products/the-web-crawler' WHERE reel_code = 'DeCzq_uyf92' AND (product_link IS NULL OR product_link = '');
UPDATE enquiries SET product_link = 'https://brickadda.com/products/the-mark-one' WHERE reel_code = 'DeccYpmSfkN' AND (product_link IS NULL OR product_link = '');

-- Play Retro — they reached out; barter ₹4,000 (90s Blast Box). 1 reel on our page (not collab) + lots of clips on Drive they edited for ads.
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,instagram,source,dispatched_on,received_on,live_on,deliverables,product_ids,reel_code,notes)
  SELECT 'https://playretro.shop/products/90sblastbox','2026-09-26T06:30:00Z','2026-10-18T12:30:00Z','delivered','Play Retro','','Barter','','Barter','₹4,000','[{"name": "Jyotishika", "role": "Intern", "phone": "+91 93942 80731"}, {"name": "Niyati Kaushik", "role": "Marketing Head", "phone": "+91 98706 01148"}]','','@playretro.bachpan','brand','2026-10-02','2026-10-03','2026-10-18','{"items": {"reel": {"on": false, "done": false, "count": 1}, "mention": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "raw": {"on": true, "done": true}, "rights": {"on": true, "done": true}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "collab": {"on": false, "done": false}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}}, "extra": [{"t": "1 reel on our page (not a collab)", "done": true}]}','[42]','DemM1ceylf2','Imported for the record. First product (3 Oct) wasn''t working — replacement received 15 Oct. Shared lots of video clips on Drive; they edited them for their ads.'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Play Retro' AND reel_code = 'DemM1ceylf2');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-09-26T06:30:00Z', 'Imported — they reached out' FROM enquiries WHERE brand = 'Play Retro' AND reel_code = 'DemM1ceylf2' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-09-28T06:30:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Play Retro' AND reel_code = 'DemM1ceylf2' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-15T06:30:00Z', '📬 Replacement product received (the first one wasn''t working)' FROM enquiries WHERE brand = 'Play Retro' AND reel_code = 'DemM1ceylf2' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-18T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Play Retro' AND reel_code = 'DemM1ceylf2' AND id NOT IN (SELECT enquiry_id FROM events);

-- TipsyTap — we reached out; barter ₹13,500 (card dealer) for 5 collab reels (2 live so far). On website + featured. No ads, no raw footage. Contact only via Instagram DMs.
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,source,dispatched_on,received_on,live_on,collab_on,deliverables,product_ids,reel_code,reels,notes)
  SELECT 'https://tipsytap.co/products/card-shuffler','2026-10-03T06:30:00Z','2026-10-26T12:30:00Z','live','Tipsytap','','Barter','','Barter','₹13,500','[]','','us','2026-10-16','2026-10-16','2026-10-25','2026-10-25','{"items": {"reel": {"on": true, "done": false, "count": 5}, "mention": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "raw": {"on": false, "done": false}, "rights": {"on": false, "done": false}, "website": {"on": true, "done": true}, "featured": {"on": true, "done": true}, "collab": {"on": true, "done": false}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}}, "extra": [{"t": "Reel 1 — live 25 Oct with collab", "done": true}, {"t": "Reel 2 — live 26 Oct with collab", "done": true}]}','[47]','De6a84ayKwv','["De8uBTrSgB9"]','Imported for the record. 5 reels in exchange for the card dealer — 2 live so far (25 Oct, 26 Oct), both with collab. Contact only via Instagram DMs.'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Tipsytap' AND reel_code = 'De6a84ayKwv');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-10-03T06:30:00Z', 'Imported — we reached out' FROM enquiries WHERE brand = 'Tipsytap' AND reel_code = 'De6a84ayKwv' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-13T06:30:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Tipsytap' AND reel_code = 'De6a84ayKwv' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-25T12:30:00Z', 'Status → live' FROM enquiries WHERE brand = 'Tipsytap' AND reel_code = 'De6a84ayKwv' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-26T12:30:00Z', '🚀 Reel 2 live with collab' FROM enquiries WHERE brand = 'Tipsytap' AND reel_code = 'De6a84ayKwv' AND id NOT IN (SELECT enquiry_id FROM events);

-- Blix — they reached out; ₹700 product + ₹1,000 payment (Queaky). Closed 3 Nov.
INSERT INTO enquiries (product_link,created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,source,dispatched_on,received_on,draft_on,live_on,paid_on,deliverables,product_ids,reel_code,notes)
  SELECT 'https://blix.in/products/bear-queaky-rechargeable','2026-10-01T06:30:00Z','2026-11-03T12:30:00Z','delivered','Blix','','','₹1,000','Paid','₹700','[]','','brand','2026-10-07','2026-10-13','2026-10-22','2026-10-30','2026-11-03','{"items": {"reel": {"on": true, "done": true, "count": 1}, "mention": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "raw": {"on": true, "done": true}, "rights": {"on": false, "done": false}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "collab": {"on": false, "done": false}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}}, "extra": []}','[48]','DfHN_zDSN5X','Imported for the record. Raw data for their ads shared on Drive on 3 Nov.'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Blix' AND reel_code = 'DfHN_zDSN5X');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-10-01T06:30:00Z', 'Imported — they reached out' FROM enquiries WHERE brand = 'Blix' AND reel_code = 'DfHN_zDSN5X' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-10-06T06:30:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Blix' AND reel_code = 'DfHN_zDSN5X' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-11-03T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Blix' AND reel_code = 'DfHN_zDSN5X' AND id NOT IN (SELECT enquiry_id FROM events);

-- Wonderbox (already in the dashboard): you bought the ₹371 product, then they paid ₹1,000 → ₹371 is product worth, ₹629 is money earned
UPDATE enquiries SET product_value = '₹371', price = '₹629' WHERE lower(replace(brand, ' ', '')) = 'wonderbox';

-- Play Retro is closed (also fixes it if you already ran this file)
UPDATE enquiries SET status = 'delivered' WHERE brand = 'Play Retro' AND reel_code = 'DemM1ceylf2' AND status = 'live';
-- Wonderbox is fully paid: payment received = the day they were added as collaborator (change it in the dashboard if it was another day)
UPDATE enquiries SET paid_on = COALESCE(NULLIF(paid_on, ''), NULLIF(collab_on, ''), NULLIF(live_on, ''), substr(updated, 1, 10)) WHERE lower(replace(brand, ' ', '')) = 'wonderbox';

-- Wonderbox + Storegenie (pitched after the reel was live): the pitch happened on the confirm day,
-- so their start date and the dashboard log move to that day (confirm day = "Collab added on Instagram",
-- else "Reel went live", else "Payment received"). Closing stays on the payment day.
UPDATE enquiries SET created = COALESCE(NULLIF(collab_on, ''), NULLIF(live_on, ''), NULLIF(paid_on, '')) || 'T06:30:00Z'
  WHERE lower(replace(brand, ' ', '')) IN ('wonderbox', 'storegenie') AND COALESCE(NULLIF(collab_on, ''), NULLIF(live_on, ''), NULLIF(paid_on, '')) IS NOT NULL;
UPDATE events SET at = (SELECT substr(e.created, 1, 10) FROM enquiries e WHERE e.id = events.enquiry_id) || 'T06:' || substr(at, 15)
  WHERE enquiry_id IN (SELECT id FROM enquiries WHERE lower(replace(brand, ' ', '')) IN ('wonderbox', 'storegenie') AND created NOT LIKE '2026-11-03%' AND created NOT LIKE '2026-11-04%')
    AND text NOT LIKE 'Status → delivered%';
UPDATE events SET at = (SELECT COALESCE(NULLIF(e.paid_on, ''), substr(e.created, 1, 10)) FROM enquiries e WHERE e.id = events.enquiry_id) || 'T06:' || substr(at, 15)
  WHERE enquiry_id IN (SELECT id FROM enquiries WHERE lower(replace(brand, ' ', '')) IN ('wonderbox', 'storegenie') AND created NOT LIKE '2026-11-03%' AND created NOT LIKE '2026-11-04%')
    AND text LIKE 'Status → delivered%';
