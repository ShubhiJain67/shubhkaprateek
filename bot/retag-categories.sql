-- New categories + every product re-tagged (5 tabs + 5 collections). Run once from bot/:
--   npx wrangler d1 execute skp-stats --remote --file=retag-categories.sql
-- The website shows it within ~10 minutes (or right away after you save anything in the dashboard).
DELETE FROM categories;
INSERT INTO categories (id, parent, pos, name, emoji, theme, keywords) VALUES
  ('marvel', NULL, 0, 'Marvel', '🦸', 1, '["marvel", "avengers", "avenger", "hulk", "spider-man", "spiderman", "iron man", "ironman", "thor", "loki", "deadpool", "black panther", "wakanda", "punisher", "captain america", "wolverine", "groot", "venom", "thanos", "gauntlet", "infinity gauntlet", "arc reactor", "x-men", "doctor strange", "black widow", "hawkeye"]'),
  ('games', NULL, 1, 'Games', '🎮', 0, '[]'),
  ('board-games', 'games', 2, 'Board & card games', '', 0, '["game", "card game", "board game", "cards", "puzzle", "jigsaw", "dobble", "uno", "chess", "ludo"]'),
  ('game-gadgets', 'games', 3, 'Game-night gadgets', '', 0, '["shuffler", "card dealer", "dealer", "console", "retro", "arcade", "controller", "blast box"]'),
  ('toys', NULL, 4, 'Toys & Collectibles', '🧸', 0, '[]'),
  ('building-sets', 'toys', 5, 'Building sets', '', 0, '["brick", "bricks", "brickset", "building block", "building blocks", "lego", "blocks"]'),
  ('figures', 'toys', 6, 'Figures & bobbleheads', '', 0, '["figure", "figurine", "bobble", "bobble head", "bobblehead", "die cast", "diecast", "funko", "collectible", "statue"]'),
  ('role-play', 'toys', 7, 'Cosplay & role-play', '', 0, '["mask", "costume", "web shooter", "sword", "shield", "gauntlet", "glove", "cape", "role play", "roleplay", "blaster"]'),
  ('clothing', NULL, 8, 'Wear', '👕', 0, '[]'),
  ('topwear', 'clothing', 9, 'T-shirts, hoodies & more', '', 0, '["t-shirt", "tshirt", "tee", "shirt", "hoodie", "sweatshirt", "sweater", "jacket", "top", "polo", "lower", "jogger", "joggers", "pyjama", "pajama", "pants", "trousers", "shorts", "jeans", "boxers", "saree", "sari", "lehenga", "kurta", "kurti", "anarkali", "salwar", "suit set", "dupatta", "sherwani", "nehru jacket", "ethnic", "blouse"]'),
  ('footwear', 'clothing', 10, 'Footwear & socks', '', 0, '["sneaker", "sneakers", "shoe", "shoes", "crocs", "clog", "clogs", "slipper", "slippers", "slides", "sandal", "sandals", "flip flops", "socks", "sock"]'),
  ('fashion-accessories', 'clothing', 11, 'Accessories', '', 0, '["perfume", "fragrance", "deo", "jibbitz", "charm", "charms", "keychain", "watch", "wallet", "cap", "bag", "bracelet", "car", "dashboard", "car accessory", "air freshener"]'),
  ('home', NULL, 12, 'Home & Cozy', '🏠', 0, '[]'),
  ('bedding', 'home', 13, 'Comforters & blankets', '', 0, '["comforter", "blanket", "quilt", "bedsheet", "bed sheet", "duvet", "pillow", "cushion", "throw"]'),
  ('mugs', 'home', 14, 'Mugs & kitchen', '', 0, '["mug", "mugs", "cup", "bottle", "sipper", "straw", "straws", "glass", "tumbler", "coaster", "popcorn", "kitchen"]'),
  ('lighting', 'home', 15, 'Lights & gadgets', '', 0, '["lamp", "night light", "projector", "led", "fairy lights", "light", "lights"]'),
  ('diy', NULL, 16, 'DIY & Activities', '🎨', 0, '["diy", "paint", "painting", "canvas", "paint by numbers", "craft", "art kit", "sketch", "clay", "coloring", "colouring"]'),
  ('date-night', NULL, 17, 'Couple date night', '💑', 1, '["couple", "date night", "for two", "2 player", "two player"]'),
  ('gifts', NULL, 18, 'Surprise gift ideas', '🎁', 1, '["gift", "surprise", "hamper", "wrapping", "wrap", "packing paper", "gift bag", "bow", "bows", "ribbon", "gift box", "tissue paper"]'),
  ('quirky', NULL, 19, 'Quirky & fun', '😂', 1, '["funny", "quirky", "prank", "google eyes", "googly", "magic"]'),
  ('electronics', NULL, 20, 'Gadgets', '🔌', 1, '["electronic", "electric", "rechargeable", "battery", "usb", "led", "light-up", "projector", "console", "shuffler", "dealer", "inflator", "inflater", "gadget", "speaker", "earbuds", "headphones", "charger", "smart", "remote control", "rc", "circuit", "buzzer"]');
UPDATE products SET category = '["diy", "date-night", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 1;  -- Paint-your-own portrait kit (Eazy Arts)
UPDATE products SET category = '["bedding", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 9;  -- Minion Comforter
UPDATE products SET category = '["bedding", "diy", "date-night", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 10;  -- Coloring blanket
UPDATE products SET category = '["mugs", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 11;  -- Google Eyes Drinking Straws
UPDATE products SET category = '["topwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 17;  -- Marvel Hoodie
UPDATE products SET category = '["building-sets", "marvel", "date-night", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 18;  -- Hulk BrickSet
UPDATE products SET category = '["fashion-accessories", "marvel", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 19;  -- Deadpool Car Accessory
UPDATE products SET category = '["role-play", "marvel", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 20;  -- Spider-Man web shooter
UPDATE products SET category = '["board-games", "date-night"]', updated = '2026-11-05T05:00:00Z' WHERE id = 21;  -- Superhero Jigsaw Puzzle
UPDATE products SET category = '["footwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 22;  -- Iron Man sneakers
UPDATE products SET category = '["board-games", "marvel", "date-night"]', updated = '2026-11-05T05:00:00Z' WHERE id = 23;  -- Marvel Dobble card game
UPDATE products SET category = '["topwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 24;  -- Arc Reactor hoodie
UPDATE products SET category = '["role-play", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 25;  -- Gauntlet
UPDATE products SET category = '["footwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 26;  -- Marvel socks
UPDATE products SET category = '["building-sets", "marvel", "date-night", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 27;  -- Spider-Man brick set
UPDATE products SET category = '["topwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 28;  -- Hulk T-shirt
UPDATE products SET category = '["fashion-accessories", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 29;  -- Black Panther perfume
UPDATE products SET category = '["topwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 30;  -- Punisher Sweater
UPDATE products SET category = '["fashion-accessories", "marvel", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 31;  -- Marvel Jibbitz
UPDATE products SET category = '["footwear", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 32;  -- Crocs
UPDATE products SET category = '["board-games", "marvel", "date-night"]', updated = '2026-11-05T05:00:00Z' WHERE id = 33;  -- Avengers Strike Squad Game
UPDATE products SET category = '["figures", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 34;  -- Marvel Go Collection Die Cast
UPDATE products SET category = '["bedding", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 35;  -- Hulk Comforter
UPDATE products SET category = '["topwear", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 36;  -- Spider-Man T-shirt
UPDATE products SET category = '["role-play", "electronics", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 37;  -- Light-up spinning sword
UPDATE products SET category = '["building-sets", "marvel", "date-night", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 38;  -- Iron Man building-block figure
UPDATE products SET category = '["role-play", "electronics", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 39;  -- Spark & smoke Sword
UPDATE products SET category = '["mugs", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 40;  -- Thor Mug
UPDATE products SET category = '["topwear", "marvel"]', updated = '2026-11-05T05:00:00Z' WHERE id = 41;  -- Spider-Man Lower
UPDATE products SET category = '["game-gadgets", "electronics", "date-night"]', updated = '2026-11-05T05:00:00Z' WHERE id = 42;  -- Play Retro — Blast Box
UPDATE products SET category = '["role-play", "marvel", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 43;  -- Spider-Man mask
UPDATE products SET category = '["mugs", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 44;  -- Iron Man mug
UPDATE products SET category = '["figures", "marvel", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 45;  -- Hulk Bobble Head
UPDATE products SET category = '["lighting", "electronics", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 46;  -- Astronaut Light
UPDATE products SET category = '["game-gadgets", "electronics", "date-night", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 47;  -- Automatic card dealer + shuffler
UPDATE products SET category = '["game-gadgets", "electronics", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 48;  -- Queaky
UPDATE products SET category = '["toys", "electronics", "quirky", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 49;  -- Flower Bubble Machine
UPDATE products SET category = '["diy", "date-night", "quirky"]', updated = '2026-11-05T05:00:00Z' WHERE id = 50;  -- Clay IceCream Maker
UPDATE products SET category = '["mugs", "electronics", "date-night"]', updated = '2026-11-05T05:00:00Z' WHERE id = 51;  -- Popcorn Maker
UPDATE products SET category = '["toys", "quirky", "gifts"]', updated = '2026-11-05T05:00:00Z' WHERE id = 52;  -- Credit Card - Magic Wand
-- products added after this list keep their categories, minus the ones that no longer exist:
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'decor') WHERE category LIKE '%"decor"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'accessories') WHERE category LIKE '%"accessories"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'ethnic-wear') WHERE category LIKE '%"ethnic-wear"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'bottomwear') WHERE category LIKE '%"bottomwear"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'game-night') WHERE category LIKE '%"game-night"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'party-decor') WHERE category LIKE '%"party-decor"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'gift-wrap') WHERE category LIKE '%"gift-wrap"%';
UPDATE products SET category = (SELECT json_group_array(value) FROM json_each(products.category) WHERE value <> 'car-accessories') WHERE category LIKE '%"car-accessories"%';
