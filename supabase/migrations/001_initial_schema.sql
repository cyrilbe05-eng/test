-- ============================================================
-- Migration 001: Initial schema
-- All tables, types, triggers, and RLS policies
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE public.project_status AS ENUM (
  'pending_assignment',
  'in_progress',
  'in_review',
  'admin_approved',
  'client_reviewing',
  'client_approved',
  'revision_requested'
);

CREATE TYPE public.file_type AS ENUM (
  'source_video',
  'deliverable',
  'attachment'
);

CREATE TYPE public.comment_author_role AS ENUM (
  'admin',
  'team',
  'client'
);

CREATE TYPE public.notification_type AS ENUM (
  'project_created',
  'team_assigned',
  'status_changed',
  'comment_added',
  'video_ready_for_review',
  'revision_requested',
  'project_approved'
);

-- ============================================================
-- PLANS
-- ============================================================

CREATE TABLE public.plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  max_deliverables      INT NOT NULL DEFAULT 1,
  max_client_revisions  INT NOT NULL DEFAULT 2,   -- -1 = unlimited
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "plans_admin_all" ON public.plans
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- All authenticated: read
CREATE POLICY "plans_authenticated_select" ON public.plans
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed default plans
INSERT INTO public.plans (name, max_deliverables, max_client_revisions) VALUES
  ('Starter', 1, 2),
  ('Growth',  2, 4),
  ('Pro',     5, -1);

-- ============================================================
-- PROFILES
-- ============================================================

CREATE TABLE public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('admin', 'team', 'client')),
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  phone            TEXT,
  avatar_url       TEXT,
  plan_id          UUID REFERENCES public.plans(id),
  password_changed BOOLEAN NOT NULL DEFAULT FALSE,
  disabled         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id AND disabled = false);

-- Admin can read all (including disabled, for management)
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Admin can update all profiles
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Users can update their own (limited fields via app logic)
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Insert only via trigger (handle_new_user)
-- No direct client INSERT policy

-- ============================================================
-- TRIGGER: auto-create profile on auth.users insert
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: updated_at helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE public.projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES public.profiles(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  status                public.project_status NOT NULL DEFAULT 'pending_assignment',
  instructions          TEXT,
  max_deliverables      INT NOT NULL DEFAULT 1,
  max_client_revisions  INT NOT NULL DEFAULT 2,
  client_revision_count INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_admin_all" ON public.projects
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "projects_client_select" ON public.projects
  FOR SELECT
  USING (
    client_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client'
  );

CREATE POLICY "projects_client_insert" ON public.projects
  FOR INSERT
  WITH CHECK (
    client_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client'
  );

CREATE POLICY "projects_team_select" ON public.projects
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'team'
    AND id IN (
      SELECT project_id FROM public.project_assignments
      WHERE team_member_id = auth.uid()
    )
  );

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TRIGGER: snapshot plan limits onto new project
-- ============================================================

CREATE OR REPLACE FUNCTION public.snapshot_plan_on_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_plan public.plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan
  FROM public.plans
  WHERE id = (SELECT plan_id FROM public.profiles WHERE id = NEW.client_id);

  IF FOUND THEN
    NEW.max_deliverables     := v_plan.max_deliverables;
    NEW.max_client_revisions := v_plan.max_client_revisions;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_snapshot_plan
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_plan_on_project();

-- ============================================================
-- PROJECT FILES
-- ============================================================

CREATE TABLE public.project_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploader_id   UUID NOT NULL REFERENCES public.profiles(id),
  file_type     public.file_type NOT NULL,
  storage_key   TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     BIGINT,
  mime_type     TEXT,
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_files_admin_all" ON public.project_files
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "project_files_client_select" ON public.project_files
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client'
    AND project_id IN (
      SELECT id FROM public.projects WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "project_files_client_insert" ON public.project_files
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client'
    AND uploader_id = auth.uid()
    AND file_type IN ('source_video', 'attachment')
    AND project_id IN (
      SELECT id FROM public.projects WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "project_files_team_select" ON public.project_files
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'team'
    AND project_id IN (
      SELECT project_id FROM public.project_assignments
      WHERE team_member_id = auth.uid()
    )
  );

CREATE POLICY "project_files_team_insert" ON public.project_files
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'team'
    AND uploader_id = auth.uid()
    AND project_id IN (
      SELECT project_id FROM public.project_assignments
      WHERE team_member_id = auth.uid()
    )
  );

-- ============================================================
-- PROJECT ASSIGNMENTS
-- ============================================================

CREATE TABLE public.project_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_member_id  UUID NOT NULL REFERENCES public.profiles(id),
  assigned_by     UUID NOT NULL REFERENCES public.profiles(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, team_member_id)
);

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_admin_all" ON public.project_assignments
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "assignments_team_select" ON public.project_assignments
  FOR SELECT
  USING (
    team_member_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'team'
  );

-- ============================================================
-- TIMELINE COMMENTS
-- ============================================================

CREATE TABLE public.timeline_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES public.profiles(id),
  author_role     public.comment_author_role NOT NULL,
  timestamp_sec   NUMERIC(8, 2),
  comment_text    TEXT NOT NULL,
  revision_round  INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.timeline_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_admin_all" ON public.timeline_comments
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "comments_client_access" ON public.timeline_comments
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client'
    AND project_id IN (
      SELECT id FROM public.projects WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "comments_team_access" ON public.timeline_comments
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'team'
    AND project_id IN (
      SELECT project_id FROM public.project_assignments
      WHERE team_member_id = auth.uid()
    )
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID NOT NULL REFERENCES public.profiles(id),
  project_id    UUID REFERENCES public.projects(id),
  type          public.notification_type NOT NULL,
  message       TEXT NOT NULL,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own_select" ON public.notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_own_update" ON public.notifications
  FOR UPDATE
  USING (recipient_id = auth.uid());

-- INSERT only via server-side (Edge Functions / triggers)
-- No client INSERT policy

-- ============================================================
-- TRIGGER: external notification hook
-- (Uses pg_net extension — ensure it's enabled in Supabase dashboard)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_external()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url  := current_setting('app.edge_function_url', true) || '/send-notification',
    body := row_to_json(NEW)::text,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_external();
