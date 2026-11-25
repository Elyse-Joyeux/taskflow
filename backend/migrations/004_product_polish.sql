-- Product polish: avatars, issue keys, time tracking, sprints, webhooks, comment threads

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS task_seq INT NOT NULL DEFAULT 0;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS issue_key TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS logged_minutes INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_issue_key ON tasks(issue_key) WHERE issue_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS time_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  minutes       INT,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_open ON time_entries(user_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS sprints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  goal          TEXT NOT NULL DEFAULT '',
  start_date    DATE,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','done')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_sprint_id_fkey'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_sprint_id_fkey
      FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL DEFAULT '',
  events        TEXT[] NOT NULL DEFAULT ARRAY['task.updated','task.created','task.deleted'],
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_workspace ON webhooks(workspace_id) WHERE enabled;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Backfill issue keys for existing tasks
WITH numbered AS (
  SELECT t.id, p.workspace_id,
         row_number() OVER (PARTITION BY p.workspace_id ORDER BY t.created_at, t.id) AS n
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE t.issue_key IS NULL
)
UPDATE tasks SET issue_key = 'TF-' || numbered.n
FROM numbered WHERE tasks.id = numbered.id;

UPDATE workspaces w SET task_seq = COALESCE((
  SELECT max(NULLIF(regexp_replace(t.issue_key, '\D', '', 'g'), '')::int)
  FROM tasks t JOIN projects p ON p.id = t.project_id
  WHERE p.workspace_id = w.id
), 0);
