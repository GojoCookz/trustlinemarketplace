-- trustline first migration: the participation engine is load-bearing
-- infrastructure and ships in migration 001, before any room works.
-- day-zero data cannot be reconstructed later.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  address TEXT UNIQUE,                -- xrpl r-address, attached at wallet connect (milestone 2)
  email TEXT,                         -- optional, captured on hub. never required.
  referral_code TEXT NOT NULL UNIQUE, -- this user's own code
  custom_code INTEGER NOT NULL DEFAULT 0, -- 1 after paid [$1 in xrp] vanity upgrade
  referral_source TEXT,               -- the code this user signed up through (permanent)
  device_hash TEXT,                   -- anti-abuse foundation
  ip_hash TEXT,                       -- anti-abuse foundation
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,               -- see lib/participation/xp.ts for the rulebook
  amount INTEGER NOT NULL,
  room TEXT NOT NULL DEFAULT 'hub',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(user_id);

CREATE TABLE IF NOT EXISTS streaks (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  current INTEGER NOT NULL DEFAULT 0,
  longest INTEGER NOT NULL DEFAULT 0,
  last_check_in TEXT                  -- utc date string YYYY-MM-DD
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,                -- e.g. 'first_checkin', 'streak_7'
  label TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL REFERENCES achievements(id),
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  xp INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS task_completions (
  user_id TEXT NOT NULL REFERENCES users(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  completed_on TEXT NOT NULL,         -- utc date YYYY-MM-DD (tasks refresh daily)
  PRIMARY KEY (user_id, task_id, completed_on)
);

-- seller profiles: extends users, not a separate table
-- a user becomes a seller by filling display_name
CREATE TABLE IF NOT EXISTS seller_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  category TEXT NOT NULL DEFAULT 'general', -- digital, physical, services, general
  store_slug TEXT UNIQUE,                   -- trustline.app/store/<slug>
  social_x TEXT,
  social_discord TEXT,
  verification_tier TEXT NOT NULL DEFAULT 'anon', -- anon, verified, trusted, elite
  verified_at TEXT,
  total_sales INTEGER NOT NULL DEFAULT 0,
  total_revenue_drops INTEGER NOT NULL DEFAULT 0, -- revenue in drops (1 XRP = 1,000,000 drops)
  avg_rating REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- listings: what sellers put up for sale
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,                   -- digital, physical, services, tokens
  price_drops INTEGER NOT NULL,             -- price in drops (phase 1: all XRP)
  currency TEXT NOT NULL DEFAULT 'XRP',
  image_urls TEXT NOT NULL DEFAULT '[]',    -- JSON array of image URLs
  status TEXT NOT NULL DEFAULT 'active',    -- active, sold, paused, removed
  escrow_type TEXT NOT NULL DEFAULT 'time_locked', -- time_locked, conditional
  delivery_days INTEGER NOT NULL DEFAULT 7,
  total_sold INTEGER NOT NULL DEFAULT 0,
  featured_until TEXT,                      -- paid placement: 10 xrp for 7 days
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

-- orders: tracks purchases through escrow
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  price_drops INTEGER NOT NULL,
  platform_fee_drops INTEGER NOT NULL,      -- 3% of price
  seller_payout_drops INTEGER NOT NULL,     -- price - fee
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, escrowed, delivered, confirmed, disputed, refunded, cancelled
  escrow_tx TEXT,                           -- xrpl escrow create tx hash
  release_tx TEXT,                          -- xrpl escrow finish tx hash
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  disputed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);

-- escrow conditions: crypto-condition secrets for PREIMAGE-SHA-256 escrow
CREATE TABLE IF NOT EXISTS escrow_conditions (
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  condition_hex TEXT NOT NULL,
  fulfillment_hex TEXT NOT NULL,
  preimage_hex TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- seller ratings: one per completed order
CREATE TABLE IF NOT EXISTS seller_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK(stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ratings_seller ON seller_ratings(seller_id);

-- platform fee ledger: every fee we collect, auditable
CREATE TABLE IF NOT EXISTS platform_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fee_type TEXT NOT NULL,                   -- marketplace, trading, verification, premium_code, featured_listing
  amount_drops INTEGER NOT NULL,
  source_id TEXT,                           -- order_id, trade_id, user_id depending on type
  payer_id TEXT REFERENCES users(id),
  tx_hash TEXT,                             -- xrpl payment tx hash
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- buyer-seller messages: tied to an order or a listing
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,              -- order_id or listing_id — groups the conversation
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  read_at TEXT,                         -- null until recipient reads
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);

-- token launches: side A of the launch room. one row per issued token.
CREATE TABLE IF NOT EXISTS launches (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  currency_hex TEXT NOT NULL,               -- 3-char code or 160-bit hex for longer tickers
  supply TEXT NOT NULL,                     -- issued-currency amounts are decimal strings
  transfer_rate_pct REAL NOT NULL DEFAULT 0, -- burn fee % (0-5), enforced on-ledger via TransferRate
  description TEXT,
  image_url TEXT,
  issuer_address TEXT NOT NULL,
  issuer_seed TEXT,                         -- REVIEW: testnet dev only. prod must use vault/KMS, never the db.
  issue_tx TEXT,                            -- payment tx that delivered supply to creator
  status TEXT NOT NULL DEFAULT 'live',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_launches_creator ON launches(creator_id);

-- rewards pools: one XRP wallet per launch, funded by the creator,
-- drained by pro-rata distributions to holders
CREATE TABLE IF NOT EXISTS reward_pools (
  launch_id TEXT PRIMARY KEY REFERENCES launches(id),
  address TEXT NOT NULL,
  seed TEXT NOT NULL,                       -- REVIEW: testnet dev only. prod distributor uses vault/KMS.
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- side B: participation launches. community earns project XP toward a
-- threshold BEFORE any token exists; TGE (1 xp = 1 token) previews at goal.
CREATE TABLE IF NOT EXISTS participation_launches (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  description TEXT,
  xp_goal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting', -- collecting, threshold_met, launched, cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- separate ledger from hub xp_events on purpose: project XP belongs to the
-- project's future token, platform XP belongs to the hub
CREATE TABLE IF NOT EXISTS project_xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id TEXT NOT NULL REFERENCES participation_launches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,               -- join, checkin, share
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_xp_launch ON project_xp_events(launch_id);
CREATE INDEX IF NOT EXISTS idx_project_xp_user ON project_xp_events(launch_id, user_id);

-- auto-distribute config: the crank. a tick endpoint pays due launches.
CREATE TABLE IF NOT EXISTS auto_distribute (
  launch_id TEXT PRIMARY KEY REFERENCES launches(id),
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  amount_drops INTEGER NOT NULL,
  last_run_at TEXT
);

-- every distribution run, auditable
CREATE TABLE IF NOT EXISTS distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id TEXT NOT NULL REFERENCES launches(id),
  total_drops INTEGER NOT NULL,
  holder_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS distribution_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id INTEGER NOT NULL REFERENCES distributions(id),
  address TEXT NOT NULL,
  amount_drops INTEGER NOT NULL,
  tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_payouts_distribution ON distribution_payouts(distribution_id);

-- platform config: single-row key/value store (e.g. dev treasury address)
CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- reserved ad inventory: log impressions from day one, even while empty
CREATE TABLE IF NOT EXISTS ad_impressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,                 -- 'hub', 'lobby', ...
  page TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- market data: every row here is derived from validated on-ledger
-- transactions or live amm_info reads. never synthesized.
CREATE TABLE IF NOT EXISTS pool_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id TEXT NOT NULL REFERENCES launches(id),
  tx_hash TEXT NOT NULL UNIQUE,
  ledger_index INTEGER NOT NULL,
  side TEXT NOT NULL,                 -- buy = xrp in / token out, sell = token in / xrp out
  token_amount REAL NOT NULL,         -- token units moved
  xrp_drops INTEGER NOT NULL,         -- xrp volume in drops (absolute)
  price REAL NOT NULL,                -- xrp per token at execution
  executed_at TEXT NOT NULL           -- tx close time (utc iso)
);
CREATE INDEX IF NOT EXISTS idx_pool_trades_launch ON pool_trades(launch_id, executed_at);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id TEXT NOT NULL REFERENCES launches(id),
  price REAL NOT NULL,                -- spot xrp per token from amm_info
  token_balance REAL NOT NULL,
  xrp_drops INTEGER NOT NULL,         -- pool xrp side in drops
  taken_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_launch ON price_snapshots(launch_id, taken_at);

-- indexer cursor: last ledger scanned per pool so swaps are never double counted
CREATE TABLE IF NOT EXISTS indexer_cursors (
  launch_id TEXT PRIMARY KEY REFERENCES launches(id),
  amm_account TEXT NOT NULL,
  last_ledger INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

-- nft collections: grouped by issuer + taxon (xrpl's native collection key).
-- stats (floor/volume) derive from nft_activity — real recorded events only.
CREATE TABLE IF NOT EXISTS nft_collections (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  issuer_address TEXT NOT NULL,
  taxon INTEGER NOT NULL,
  royalty_pct REAL NOT NULL DEFAULT 0,     -- TransferFee / 1000 (xrpl: 0-50000 = 0-50%)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(issuer_address, taxon)
);

CREATE TABLE IF NOT EXISTS nft_items (
  nftoken_id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES nft_collections(id),
  name TEXT NOT NULL,
  image_url TEXT,
  minter_id TEXT NOT NULL REFERENCES users(id),
  owner_address TEXT NOT NULL,             -- updated when platform records a transfer
  serial INTEGER,
  mint_tx TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nft_items_collection ON nft_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_nft_items_owner ON nft_items(owner_address);

-- every row ties to an on-ledger tx hash
CREATE TABLE IF NOT EXISTS nft_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nftoken_id TEXT NOT NULL,
  collection_id TEXT,
  type TEXT NOT NULL,                      -- mint, sell_offer, buy_offer, sale
  price_drops INTEGER,
  from_address TEXT,
  to_address TEXT,
  tx_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nft_activity_collection ON nft_activity(collection_id, created_at);
CREATE INDEX IF NOT EXISTS idx_nft_activity_token ON nft_activity(nftoken_id);

-- lp position history: every AMMCreate/AMMDeposit/AMMWithdraw touching our
-- pools, parsed from validated on-ledger txs. cost basis for pnl/fees math.
CREATE TABLE IF NOT EXISTS lp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  ledger_index INTEGER NOT NULL,
  account TEXT NOT NULL,               -- the LP's address
  type TEXT NOT NULL,                  -- create, deposit, withdraw
  token_amount REAL NOT NULL,          -- absolute token side
  xrp_drops INTEGER NOT NULL,          -- absolute xrp side
  price REAL,                          -- xrp per token at event (null if one-sided)
  executed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_events_pos ON lp_events(launch_id, account);

CREATE TABLE IF NOT EXISTS lp_cursors (
  launch_id TEXT PRIMARY KEY,
  amm_account TEXT NOT NULL,
  last_ledger INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
