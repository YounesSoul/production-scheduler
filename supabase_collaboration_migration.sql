-- ═══════════════════════════════════════════════════
-- COLLABORATION SYSTEM MIGRATION
-- Run this in Supabase SQL Editor ONCE
-- ═══════════════════════════════════════════════════

-- 0. Clean existing data since we are restructuring
DELETE FROM schedule_entries;
DELETE FROM orders;

-- 1. Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    company_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function and Trigger to automatically create a profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Insert existing users into profiles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Collaborators Junction Table
DO $$ BEGIN
    CREATE TYPE project_role AS ENUM ('admin', 'planner', 'manager', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.collaborators (
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role project_role NOT NULL DEFAULT 'viewer',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Automatic first project creation for new users
CREATE OR REPLACE FUNCTION public.handle_new_profile_project()
RETURNS TRIGGER AS $$
DECLARE
  new_proj_id UUID;
BEGIN
  -- Create default project
  INSERT INTO public.projects (name, owner_id)
  VALUES ('My Default Project', new.id)
  RETURNING id INTO new_proj_id;
  
  -- Add user as admin to their default project
  INSERT INTO public.collaborators (project_id, user_id, role)
  VALUES (new_proj_id, new.id, 'admin');
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_profile_project();

-- Create default projects for existing profiles
DO $$
DECLARE
    r RECORD;
    new_proj_id UUID;
BEGIN
    FOR r IN SELECT id FROM public.profiles WHERE id NOT IN (SELECT owner_id FROM public.projects) LOOP
        INSERT INTO public.projects (name, owner_id) VALUES ('My Default Project', r.id) RETURNING id INTO new_proj_id;
        INSERT INTO public.collaborators (project_id, user_id, role) VALUES (new_proj_id, r.id, 'admin');
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Invitations Table
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    inviter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_email TEXT NOT NULL,
    role project_role NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Modify existing tables (Orders & Schedule Entries)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.orders DROP COLUMN IF EXISTS user_id CASCADE; -- replacing isolated user_id with project_id

ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.schedule_entries DROP COLUMN IF EXISTS user_id CASCADE; -- replacing isolated user_id with project_id

-- 6. Notes & Comments
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL, -- 'order', 'chain', 'project'
    target_id UUID NOT NULL,
    content TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Activity Logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    entity_id UUID NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ═══════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper functions to prevent infinite recursion
DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_project_member(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_role(target_project_id UUID, user_uid UUID)
RETURNS public.project_role AS $$
  SELECT role FROM public.collaborators 
  WHERE project_id = target_project_id AND user_id = user_uid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_project_member(target_project_id UUID, user_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators 
    WHERE project_id = target_project_id AND user_id = user_uid
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;


-- Profiles: 
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Projects:
DROP POLICY IF EXISTS "Members can view projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
CREATE POLICY "Members can view projects" ON public.projects FOR SELECT USING (
    owner_id = auth.uid() OR public.is_project_member(id, auth.uid())
);
CREATE POLICY "Admins can update projects" ON public.projects FOR UPDATE USING (
    owner_id = auth.uid() OR public.get_user_role(id, auth.uid()) = 'admin'
);
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE USING (
    owner_id = auth.uid()
);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (
    owner_id = auth.uid()
);

-- Collaborators:
DROP POLICY IF EXISTS "Members can view collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admins can insert collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Users can join if invited" ON public.collaborators;
DROP POLICY IF EXISTS "Admins can update collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admins can delete collaborators" ON public.collaborators;
CREATE POLICY "Members can view collaborators" ON public.collaborators FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Admins can insert collaborators" ON public.collaborators FOR INSERT WITH CHECK (
    public.get_user_role(project_id, auth.uid()) = 'admin'
);
CREATE POLICY "Users can join if invited" ON public.collaborators FOR INSERT WITH CHECK (
    user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.invitations i
        WHERE i.project_id = collaborators.project_id
        AND i.invitee_email = (SELECT email FROM public.profiles p WHERE p.id = auth.uid())
        AND i.status = 'pending'
    )
);
CREATE POLICY "Admins can update collaborators" ON public.collaborators FOR UPDATE USING (
    public.get_user_role(project_id, auth.uid()) = 'admin'
);
CREATE POLICY "Admins can delete collaborators" ON public.collaborators FOR DELETE USING (
    public.get_user_role(project_id, auth.uid()) = 'admin' OR user_id = auth.uid() -- Can also leave project
);

-- Invitations:
DROP POLICY IF EXISTS "Members can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Invitees can view their invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Invitees can update invitation status" ON public.invitations;
CREATE POLICY "Members can view invitations" ON public.invitations FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Invitees can view their invitations" ON public.invitations FOR SELECT USING (
    invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Admins can manage invitations" ON public.invitations FOR ALL USING (
    public.get_user_role(project_id, auth.uid()) = 'admin'
);
CREATE POLICY "Invitees can update invitation status" ON public.invitations FOR UPDATE USING (
    invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- Orders:
DROP POLICY IF EXISTS "Users see own orders" ON public.orders;
DROP POLICY IF EXISTS "Users insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Users update own orders" ON public.orders;
DROP POLICY IF EXISTS "Users delete own orders" ON public.orders;
DROP POLICY IF EXISTS "Members can view orders" ON public.orders;
DROP POLICY IF EXISTS "Planner+ can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Planner+ can update orders" ON public.orders;
DROP POLICY IF EXISTS "Planner+ can delete orders" ON public.orders;

CREATE POLICY "Members can view orders" ON public.orders FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Planner+ can insert orders" ON public.orders FOR INSERT WITH CHECK (
    public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner')
);
CREATE POLICY "Planner+ can update orders" ON public.orders FOR UPDATE USING (
    public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner', 'manager')
);
CREATE POLICY "Planner+ can delete orders" ON public.orders FOR DELETE USING (
    public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner')
);

-- Schedule Entries:
DROP POLICY IF EXISTS "Users see own schedule" ON public.schedule_entries;
DROP POLICY IF EXISTS "Users insert own schedule" ON public.schedule_entries;
DROP POLICY IF EXISTS "Users update own schedule" ON public.schedule_entries;
DROP POLICY IF EXISTS "Users delete own schedule" ON public.schedule_entries;
DROP POLICY IF EXISTS "Members can view schedules" ON public.schedule_entries;
DROP POLICY IF EXISTS "Planner+ can insert schedules" ON public.schedule_entries;
DROP POLICY IF EXISTS "Planner+ can update schedules" ON public.schedule_entries;
DROP POLICY IF EXISTS "Planner+ can delete schedules" ON public.schedule_entries;

CREATE POLICY "Members can view schedules" ON public.schedule_entries FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Planner+ can insert schedules" ON public.schedule_entries FOR INSERT WITH CHECK (
    public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner')
);
CREATE POLICY "Planner+ can update schedules" ON public.schedule_entries FOR UPDATE USING (
    public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner')
);
CREATE POLICY "Planner+ can delete schedules" ON public.schedule_entries FOR DELETE USING (
    public.get_user_role(project_id, auth.uid()) IN ('admin', 'planner')
);

-- Comments:
DROP POLICY IF EXISTS "Members can view comments" ON public.comments;
DROP POLICY IF EXISTS "Members can add comments" ON public.comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Members can view comments" ON public.comments FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Members can add comments" ON public.comments FOR INSERT WITH CHECK (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE USING (
    author_id = auth.uid() OR public.get_user_role(project_id, auth.uid()) = 'admin'
);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE USING (
    author_id = auth.uid() OR public.get_user_role(project_id, auth.uid()) = 'admin'
);

-- Activity Logs:
DROP POLICY IF EXISTS "Members can view logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Members can insert logs" ON public.activity_logs;
CREATE POLICY "Members can view logs" ON public.activity_logs FOR SELECT USING (
    public.is_project_member(project_id, auth.uid())
);
CREATE POLICY "Members can insert logs" ON public.activity_logs FOR INSERT WITH CHECK (
    public.is_project_member(project_id, auth.uid())
);

-- Notifications:
DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (
    true
);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (
    user_id = auth.uid()
);

-- Turn on Realtime for collaborative tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'orders' AND pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'schedule_entries' AND pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_entries;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'comments' AND pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'activity_logs' AND pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END;
$$ LANGUAGE plpgsql;
