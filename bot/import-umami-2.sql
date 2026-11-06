-- Part 2 of the one-time Umami import: what import-umami.sql left out (30 Oct – 4 Nov 2026 00:37 IST).
--  • go 'old link' = people who opened our old reel links (shubhkaprateek.com/?from=queaky etc.) — the /go links before /go existed:
--      queaky → Queaky (48) · bubblemachine → Flower Bubble Machine (49) · clayicecreammaker / clayicreammaker → Clay IceCream Maker (50)
--  • go 'direct' = the 5 /go clicks on 3 Nov night (Queaky ×3, Popcorn Maker, Flower Bubble Machine)
--  • visit site / bio = visits from the Instagram bio link (2,029) — stored, not shown on any page yet
--  • p:12 = the deleted product (Balloon Inflater): 1 Buy click + 2 page views — shows only if a product with id 12 comes back
-- Totals: go 1390 · visit 2029 · buy 1 · view 2
-- Safe to run twice (settings → import:umami:2). Undo: DELETE FROM hits WHERE src IN ('old link', 'umami', 'bio') AND day < '2026-11-05'; plus the 5 direct go rows on 2026-11-03
-- Run from the bot folder:  npx wrangler d1 execute skp-stats --remote --file=import-umami-2.sql
CREATE TABLE IF NOT EXISTS hits (day TEXT, kind TEXT, item TEXT, src TEXT, n INTEGER, PRIMARY KEY (day, kind, item, src));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
WITH v(day, kind, item, src, n) AS (VALUES
  ('2026-10-30','buy','p:12','umami',1),
  ('2026-10-30','go','p:48','old link',208),
  ('2026-10-30','view','p:12','umami',2),
  ('2026-10-30','visit','site','bio',351),
  ('2026-10-31','go','p:48','old link',487),
  ('2026-10-31','go','p:49','old link',138),
  ('2026-10-31','visit','site','bio',1214),
  ('2026-11-01','go','p:48','old link',153),
  ('2026-11-01','go','p:49','old link',213),
  ('2026-11-01','visit','site','bio',295),
  ('2026-11-02','go','p:48','old link',77),
  ('2026-11-02','go','p:49','old link',39),
  ('2026-11-02','go','p:50','old link',4),
  ('2026-11-02','visit','site','bio',88),
  ('2026-11-03','go','p:48','direct',3),
  ('2026-11-03','go','p:48','old link',40),
  ('2026-11-03','go','p:49','direct',1),
  ('2026-11-03','go','p:49','old link',23),
  ('2026-11-03','go','p:50','old link',1),
  ('2026-11-03','go','p:51','direct',1),
  ('2026-11-03','visit','site','bio',80),
  ('2026-11-04','go','p:48','old link',2),
  ('2026-11-04','visit','site','bio',1)
)
INSERT INTO hits (day, kind, item, src, n)
  SELECT day, kind, item, src, n FROM v WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'import:umami:2')
  ON CONFLICT (day, kind, item, src) DO UPDATE SET n = hits.n + excluded.n;
INSERT OR IGNORE INTO settings (key, value) VALUES ('import:umami:2', '{"rows": 23}');
