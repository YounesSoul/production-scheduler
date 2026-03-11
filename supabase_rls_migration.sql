-- ═══════════════════════════════════════════════════
-- USER DATA ISOLATION — Add user_id + RLS policies
-- Run this in Supabase SQL Editor ONCE
-- ═══════════════════════════════════════════════════

-- 0. Clean existing data (it has no user_id, so it would become orphaned anyway)
DELETE FROM schedule_entries;
DELETE FROM orders;
DELETE FROM settings;

-- 1. Add user_id column to all tables (nullable, default filled on insert by app)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Drop old permissive policies
DROP POLICY IF EXISTS "Allow all on orders" ON orders;
DROP POLICY IF EXISTS "Allow all on schedule_entries" ON schedule_entries;
DROP POLICY IF EXISTS "Allow all on settings" ON settings;

-- 3. Create new per-user RLS policies
CREATE POLICY "Users see own orders" ON orders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own orders" ON orders FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own orders" ON orders FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own orders" ON orders FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users see own schedule" ON schedule_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own schedule" ON schedule_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own schedule" ON schedule_entries FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own schedule" ON schedule_entries FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users see own settings" ON settings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own settings" ON settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own settings" ON settings FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own settings" ON settings FOR DELETE USING (user_id = auth.uid());

-- 4. Fix settings primary key to be composite (key + user_id)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (key, user_id);

-- 5. Set default for future inserts (auto-fills user_id from JWT)
ALTER TABLE orders ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE schedule_entries ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE settings ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_user_id ON schedule_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
