-- ============================================================
-- Migration 003 – feature tables
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ── Subtasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  completed     BOOLEAN NOT NULL DEFAULT false,
  "order"       INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, "order");

-- ── Task dependencies ─────────────────────────────────────────
-- A task "depends on" another: task_id cannot enter in_progress
-- until depends_on_id is done (enforced at the API layer).
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dep_dep ON task_dependencies(depends_on_id);

-- ── File attachments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  filename      TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,   -- uuid-based name on disk
  mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id, created_at DESC);

-- ── Milestones ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description   TEXT NOT NULL DEFAULT '',
  due_date      DATE,
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, due_date NULLS LAST);

-- link tasks to a milestone (optional)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;

-- ── Notification preferences ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL,   -- e.g. 'task.assigned', 'comment', 'deadline'
  in_app              BOOLEAN NOT NULL DEFAULT true,
  email_enabled       BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, event_type)
);

-- ── Workspace invitations ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT,
  token         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_invites_token ON workspace_invites(token);

-- ── Automation rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = workspace-wide
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  trigger_type  TEXT NOT NULL,   -- 'status_changed','task_created','deadline_approaching','recurring'
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type   TEXT NOT NULL,   -- 'assign_user','notify','change_status','create_task'
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_workspace ON automation_rules(workspace_id, enabled);
CREATE INDEX IF NOT EXISTS idx_automation_project  ON automation_rules(project_id)  WHERE project_id IS NOT NULL;

-- ── Automation execution log ──────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  task_id       UUID REFERENCES tasks(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','skipped')),
  message       TEXT NOT NULL DEFAULT '',
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule ON automation_logs(rule_id, executed_at DESC);

-- ── Recurring task templates ───────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description     TEXT NOT NULL DEFAULT '',
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  estimated_hours NUMERIC(7,2),
  tags            TEXT[] NOT NULL DEFAULT '{}',
  -- rrule-lite fields
  frequency       TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly','monthly')),
  interval_count  INT  NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  day_of_week     INT,    -- 0=Sun … 6=Sat  (weekly)
  day_of_month    INT,    -- 1-31           (monthly)
  next_run_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring_tasks(next_run_at) WHERE active = true;

-- Track which task instances were generated from a template
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_task_id UUID REFERENCES recurring_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(recurring_task_id) WHERE recurring_task_id IS NOT NULL;

-- ── Task watchers / subscribers ───────────────────────────────
CREATE TABLE IF NOT EXISTS task_watchers (
  task_id    UUID NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_watchers_user ON task_watchers(user_id);

-- ── Comment threading (parent_id) ─────────────────────────────
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;

-- ── Task acceptance criteria ───────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT NOT NULL DEFAULT '';

-- ── Updated-at trigger helper ─────────────────────────────────
-- Function used by triggers to auto-stamp updated_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='subtasks_updated_at') THEN
    CREATE TRIGGER subtasks_updated_at BEFORE UPDATE ON subtasks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='milestones_updated_at') THEN
    CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='automation_rules_updated_at') THEN
    CREATE TRIGGER automation_rules_updated_at BEFORE UPDATE ON automation_rules
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='recurring_tasks_updated_at') THEN
    CREATE TRIGGER recurring_tasks_updated_at BEFORE UPDATE ON recurring_tasks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Additional performance indexes ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_assignee    ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON tasks(due_date)    WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by  ON tasks(created_by)  WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_unread      ON notifications(user_id, read) WHERE read = false;
