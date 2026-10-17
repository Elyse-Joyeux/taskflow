CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

INSERT INTO workspaces (name, owner_id)
SELECT DISTINCT TRIM(BOTH FROM COALESCE(u.display_name, 'Personal')) || '''s workspace', u.id
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id);

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
FROM workspaces w
WHERE w.owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE projects p
SET workspace_id = w.id
FROM workspaces w
WHERE p.workspace_id IS NULL AND w.owner_id = p.owner_id;

UPDATE projects p
SET workspace_id = (
  SELECT wm.workspace_id
  FROM project_members pm
  JOIN workspace_members wm ON wm.user_id = pm.user_id
  WHERE pm.project_id = p.id
  ORDER BY wm.created_at
  LIMIT 1
)
WHERE p.workspace_id IS NULL;

INSERT INTO workspaces (name)
SELECT 'Recovered workspace'
WHERE EXISTS (SELECT 1 FROM projects WHERE workspace_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE name = 'Recovered workspace' AND owner_id IS NULL);

UPDATE projects
SET workspace_id = (SELECT id FROM workspaces WHERE name = 'Recovered workspace' AND owner_id IS NULL ORDER BY created_at LIMIT 1)
WHERE workspace_id IS NULL;

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT p.workspace_id, pm.user_id, CASE WHEN pm.role = 'owner' THEN 'owner' WHEN pm.role = 'admin' THEN 'admin' ELSE 'member' END
FROM project_members pm
JOIN projects p ON p.id = pm.project_id
WHERE p.workspace_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_search ON tasks USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_id, status);
