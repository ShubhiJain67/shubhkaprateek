-- One-time: past collabs, added to the dashboard for the record (no website pages are created or changed).
-- First: make ship, open shubhkaprateek.com/admin once (that adds the new columns). Then from bot/:
--   npx wrangler d1 execute skp-stats --remote --file=import-past.sql
-- Safe to run twice: a deal that's already there is skipped.

-- Eazy Arts — barter, reel DV2XLW2EuoN (Paint-your-own portrait kit, product 1)
INSERT INTO enquiries (created,updated,status,brand,email,package,price,payment,product_value,contacts,contact,source,received_on,draft_on,live_on,collab_on,deliverables,product_ids,reel_code,notes)
  SELECT '2026-02-24T06:30:00Z','2026-03-14T12:30:00Z','delivered','Eazy Arts','','Barter','','Barter','₹3,500','[{"name": "Ayushi", "role": "Marketing", "phone": "+91 81475 37032"}]','','us','2026-03-07','2026-03-12','2026-03-14','2026-03-14','{"items": {"reel": {"on": true, "done": true, "count": 1}, "mention": {"on": false, "done": false}, "stories": {"on": false, "done": false, "count": 0}, "raw": {"on": true, "done": true}, "rights": {"on": false, "done": false}, "website": {"on": false, "done": false}, "featured": {"on": false, "done": false}, "collab": {"on": true, "done": true}, "links": {"on": false, "done": false}, "repush": {"on": false, "done": false}, "refund": {"on": false, "done": false}}, "extra": [{"t": "Final edited video shared", "done": true}]}','[1]','DV2XLW2EuoN','Imported for the record. Shared raw clips + final video; closed on 14 Mar.'
  WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN');
INSERT INTO events (enquiry_id, at, text)
  SELECT id, '2026-02-24T06:30:00Z', 'Imported — we reached out' FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-02-24T06:31:00Z', 'Status → confirmed' FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN' AND id NOT IN (SELECT enquiry_id FROM events)
  UNION ALL SELECT id, '2026-03-14T12:30:00Z', 'Status → delivered' FROM enquiries WHERE brand = 'Eazy Arts' AND reel_code = 'DV2XLW2EuoN' AND id NOT IN (SELECT enquiry_id FROM events);
