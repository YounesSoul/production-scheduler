-- ═══════════════════════════════════════════════════
-- TEXTILE SCHEDULER — Supabase Schema
-- Run this in the Supabase SQL Editor (supabase.com → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════

-- 1. Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    piece_type TEXT DEFAULT '',
    quantity INTEGER DEFAULT 0,
    arrival_date TEXT DEFAULT '',
    delivery_date TEXT DEFAULT '',
    duration INTEGER DEFAULT 1,
    priority TEXT DEFAULT 'normal',
    locked_chain TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Schedule entries table
CREATE TABLE IF NOT EXISTS schedule_entries (
    id SERIAL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    chain TEXT NOT NULL DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    duration INTEGER DEFAULT 1,
    status TEXT DEFAULT 'On Time',
    split_group TEXT DEFAULT NULL,
    split_position TEXT DEFAULT NULL
);

-- 3. Settings table (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert default production rate
INSERT INTO settings (key, value) VALUES ('pieces_per_day', '630')
ON CONFLICT (key) DO NOTHING;

-- 4. Enable Row Level Security (RLS) — allow all for anon key (public app)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policies: allow all operations for anonymous users
CREATE POLICY "Allow all on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on schedule_entries" ON schedule_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on settings" ON settings FOR ALL USING (true) WITH CHECK (true);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_order_id ON schedule_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_schedule_chain ON schedule_entries(chain);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client);
