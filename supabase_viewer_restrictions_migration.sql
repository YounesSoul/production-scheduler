-- ═══════════════════════════════════════════════════
-- VIEWER RESTRICTIONS MIGRATION
-- Run this in Supabase SQL Editor ONCE
-- ═══════════════════════════════════════════════════

-- 1. Add is_hidden column to orders and schedule_entries
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- 2. Update RLS on orders to block viewers from seeing hidden rows
DROP POLICY IF EXISTS "Members can view orders" ON public.orders;

CREATE POLICY "Members can view orders" ON public.orders FOR SELECT USING (
    public.is_project_member(project_id, auth.uid()) 
    AND (
        is_hidden = false 
        OR public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner', 'manager')
    )
);

-- 3. Update RLS on schedule_entries to block viewers from seeing hidden rows
DROP POLICY IF EXISTS "Members can view schedules" ON public.schedule_entries;

CREATE POLICY "Members can view schedules" ON public.schedule_entries FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
    AND (
        is_hidden = false 
        OR public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner', 'manager')
    )
);

-- Note: The UPDATE rules for 'planner+' roles remain unchanged because those 
-- roles are the only ones allowed to update orders/schedules anyway, so they 
-- naturally have the right to modify the is_hidden flag during an update.
