import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { applyMigrations } from "./migrate.js";
import { canTransition, type TaskStatus } from "./workflow.js";

// Deliberately separate from .env: demo seeding must never inherit the app's
// hosted DATABASE_URL. It accepts only an explicitly configured loopback DB.
dotenv.config({ path: path.resolve(process.cwd(), ".env.demo"), override: false });

const connectionString = process.env.DEMO_DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DEMO_DATABASE_URL in backend/.env.demo to a dedicated local database.");
}
const dbUrl = new URL(connectionString);
if (!/^postgres(?:ql)?:$/.test(dbUrl.protocol) || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(dbUrl.hostname)) {
  throw new Error("Demo seeding is restricted to PostgreSQL on this computer (localhost/loopback).");
}

const DEMO_PASSWORD = "TaskflowDemo2026!";
const accounts = [
  { email: "demo@taskflow.local", name: "Jordan Lee" },
  { email: "alex@taskflow.local", name: "Alex Morgan" },
] as const;

const pool = new Pool({ connectionString, ssl: false });
const today = new Date();
const dateAt = (offset: number) => {
  const value = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
  return value.toISOString().slice(0, 10);
};

async function getUser(email: string, name: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users(email, display_name, password_hash) VALUES($1,$2,$3)
     ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name, password_hash=EXCLUDED.password_hash
     RETURNING id`,
    [email, name, passwordHash],
  );
  return result.rows[0].id;
}

async function getWorkspace(ownerId: string) {
  const name = "Taskflow Demo Team";
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id=$1 AND name=$2 ORDER BY created_at LIMIT 1",
    [ownerId, name],
  );
  const id = existing.rows[0]?.id ?? (await pool.query<{ id: string }>(
    "INSERT INTO workspaces(name, owner_id) VALUES($1,$2) RETURNING id",
    [name, ownerId],
  )).rows[0].id;
  await pool.query(
    "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='owner'",
    [id, ownerId],
  );
  return id;
}

async function getProject(workspaceId: string, ownerId: string, name: string, description: string) {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM projects WHERE workspace_id=$1 AND name=$2 ORDER BY created_at LIMIT 1",
    [workspaceId, name],
  );
  const projectId = existing.rows[0]?.id ?? (await pool.query<{ id: string }>(
    `INSERT INTO projects(workspace_id, owner_id, name, description, starts_on, due_date)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [workspaceId, ownerId, name, description, dateAt(-7), dateAt(30)],
  )).rows[0].id;
  for (const [userId, role] of [[ownerId, "owner"], [teammateId, "member"]] as const) {
    await pool.query(
      "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role",
      [projectId, userId, role],
    );
  }
  return projectId;
}

let teammateId = "";

async function getTask(projectId: string, ownerId: string, assigneeId: string, item: {
  title: string; description: string; status: TaskStatus; priority: string;
  tags: string[]; dueIn: number; hours: number;
}) {
  const existing = await pool.query<{ id: string; status: TaskStatus }>(
    "SELECT id,status FROM tasks WHERE project_id=$1 AND title=$2 ORDER BY created_at LIMIT 1",
    [projectId, item.title],
  );
  let taskId: string;
  let status: TaskStatus;
  if (existing.rows[0]) {
    taskId = existing.rows[0].id;
    status = existing.rows[0].status;
    await pool.query(
      `UPDATE tasks SET description=$3,priority=$4,tags=$5,due_date=$6,estimated_hours=$7,assignee_id=$8,updated_at=now()
       WHERE id=$1 AND project_id=$2`,
      [taskId, projectId, item.description, item.priority, item.tags, dateAt(item.dueIn), item.hours, assigneeId],
    );
  } else {
    const created = await pool.query<{ id: string; status: TaskStatus }>(
      `INSERT INTO tasks(project_id,title,description,status,priority,tags,due_date,estimated_hours,assignee_id,created_by)
       VALUES($1,$2,$3,'todo',$4,$5,$6,$7,$8,$9) RETURNING id,status`,
      [projectId, item.title, item.description, item.priority, item.tags, dateAt(item.dueIn), item.hours, assigneeId, ownerId],
    );
    taskId = created.rows[0].id;
    status = created.rows[0].status;
  }

  // Demonstration tasks reach their sample state through the same allowed
  // workflow transitions enforced by the API.
  const queue: TaskStatus[][] = [[status]];
  const previous = new Map<TaskStatus, TaskStatus | null>([[status, null]]);
  while (queue.length && !previous.has(item.status)) {
    const level = queue.shift()!;
    const from = level[0];
    const choices: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
    for (const to of choices) {
      if (previous.has(to) || !canTransition(from, to) || from === to) continue;
      previous.set(to, from);
      queue.push([to]);
    }
  }
  if (!previous.has(item.status)) throw new Error(`No valid workflow path from ${status} to ${item.status}.`);
  const pathBack: TaskStatus[] = [];
  for (let step: TaskStatus | null = item.status; step; step = previous.get(step) ?? null) pathBack.push(step);
  const transitions = pathBack.slice(0, -1).reverse();
  let current = status;
  for (const next of transitions) {
    if (!canTransition(current, next)) throw new Error(`Invalid demo task transition: ${current} -> ${next}`);
    await pool.query("UPDATE tasks SET status=$2,updated_at=now() WHERE id=$1", [taskId, next]);
    current = next;
  }
  return taskId;
}

async function addChecklist(taskId: string, title: string, completed: boolean) {
  await pool.query(
    `INSERT INTO checklist_items(task_id,title,completed)
     SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM checklist_items WHERE task_id=$1 AND title=$2)`,
    [taskId, title, completed],
  );
}

async function addComment(taskId: string, userId: string, body: string) {
  await pool.query(
    `INSERT INTO comments(task_id,user_id,body)
     SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM comments WHERE task_id=$1 AND user_id=$2 AND body=$3)`,
    [taskId, userId, body],
  );
}

async function addActivity(projectId: string, taskId: string, actorId: string, action: string, details: object) {
  const json = JSON.stringify(details);
  await pool.query(
    `INSERT INTO activity_events(project_id,task_id,actor_id,action,details)
     SELECT $1,$2,$3,$4,$5::jsonb WHERE NOT EXISTS(
       SELECT 1 FROM activity_events WHERE project_id=$1 AND task_id=$2 AND actor_id=$3 AND action=$4 AND details=$5::jsonb)`,
    [projectId, taskId, actorId, action, json],
  );
}

async function addNotification(userId: string, projectId: string, taskId: string, message: string) {
  await pool.query(
    `INSERT INTO notifications(user_id,message,project_id,task_id)
     SELECT $1,$2,$3,$4 WHERE NOT EXISTS(
       SELECT 1 FROM notifications WHERE user_id=$1 AND message=$2 AND project_id=$3 AND task_id=$4)`,
    [userId, message, projectId, taskId],
  );
}

async function seedProject(workspaceId: string, ownerId: string, project: {
  name: string; description: string; tasks: Parameters<typeof getTask>[3][];
}) {
  const projectId = await getProject(workspaceId, ownerId, project.name, project.description);
  const createdTasks: { id: string; title: string }[] = [];
  for (const [index, task] of project.tasks.entries()) {
    const assigneeId = index % 2 === 0 ? ownerId : teammateId;
    const taskId = await getTask(projectId, ownerId, assigneeId, task);
    createdTasks.push({ id: taskId, title: task.title });
    if (index === 0) {
      await addChecklist(taskId, "Confirm the scope with the team", true);
      await addChecklist(taskId, "Add notes and examples", true);
      await addChecklist(taskId, "Share the final summary", false);
      await addComment(taskId, teammateId, "I added the latest research notes. The main themes are ready for review.");
    }
    if (index === 1) await addComment(taskId, ownerId, "Alex, could you share feedback before the next team check-in?");
    await addActivity(projectId, taskId, assigneeId, "task.status_changed", { title: task.title, status: task.status });
  }

  const postBody = `A quick update from the ${project.name} team: we've added clear owners and review points, and the latest work is ready for everyone to follow along.`;
  const existingPost = await pool.query<{ id: string }>(
    "SELECT id FROM community_posts WHERE project_id=$1 AND author_id=$2 AND body=$3 ORDER BY created_at LIMIT 1",
    [projectId, ownerId, postBody],
  );
  const postId = existingPost.rows[0]?.id ?? (await pool.query<{ id: string }>(
    "INSERT INTO community_posts(project_id,author_id,body) VALUES($1,$2,$3) RETURNING id",
    [projectId, ownerId, postBody],
  )).rows[0].id;
  await pool.query(
    `INSERT INTO community_replies(post_id,author_id,body)
     SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM community_replies WHERE post_id=$1 AND author_id=$2 AND body=$3)`,
    [postId, teammateId, "Great progress. I'll review the open items before our next check-in."],
  );
  await pool.query("INSERT INTO community_reactions(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [postId, teammateId]);
  if (createdTasks[0]) await addNotification(teammateId, projectId, createdTasks[0].id, `Jordan added you to ${project.name}.`);
  return { projectId, taskCount: createdTasks.length };
}

async function main() {
  try {
    await applyMigrations(pool, path.resolve(process.cwd(), "migrations"));
    const [ownerId, memberId] = await Promise.all(accounts.map((account) => getUser(account.email, account.name)));
    teammateId = memberId;
    const workspaceId = await getWorkspace(ownerId);
    await pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='member'",
      [workspaceId, memberId],
    );

    const projects = await Promise.all([
      seedProject(workspaceId, ownerId, {
        name: "Website Refresh",
        description: "A collaborative redesign focused on a clearer customer journey and accessible, responsive pages.",
        tasks: [
          { title: "Audit the current customer journey", description: "Review the main paths through the site and note points where people lose momentum.", status: "done", priority: "high", tags: ["research", "website"], dueIn: -2, hours: 3 },
          { title: "Map a simpler onboarding flow", description: "Turn the research into a small, easy-to-follow first visit experience.", status: "in_review", priority: "high", tags: ["planning", "ux"], dueIn: 2, hours: 5 },
          { title: "Design the first-run checklist", description: "Create reusable onboarding steps for new customers and workspace owners.", status: "in_progress", priority: "medium", tags: ["design", "onboarding"], dueIn: 5, hours: 4 },
          { title: "Review accessibility and keyboard states", description: "Check focus order, contrast, labels, and keyboard-only interaction on key pages.", status: "todo", priority: "urgent", tags: ["accessibility", "qa"], dueIn: 3, hours: 3 },
          { title: "Publish launch-ready copy", description: "Prepare final page copy and confirm links and calls to action before release.", status: "backlog", priority: "low", tags: ["content"], dueIn: 12, hours: 2 },
        ],
      }),
      seedProject(workspaceId, ownerId, {
        name: "Product Launch",
        description: "Prepare a coordinated beta launch with a dependable onboarding and support experience.",
        tasks: [
          { title: "Confirm the beta cohort", description: "Agree on the first group of teams and record the criteria for joining.", status: "done", priority: "medium", tags: ["launch", "planning"], dueIn: -1, hours: 2 },
          { title: "Prepare launch notes", description: "Write a concise introduction to the release and the features available in beta.", status: "in_progress", priority: "high", tags: ["content", "launch"], dueIn: 4, hours: 3 },
          { title: "Test invitation and notification flows", description: "Verify workspace invitations, email links, and the in-app notification experience.", status: "todo", priority: "urgent", tags: ["testing", "email"], dueIn: 2, hours: 4 },
        ],
      }),
    ]);

    console.log("Taskflow demo workspace seeded on the local database.");
    console.log(`Workspace: Taskflow Demo Team | Projects: ${projects.length} | Tasks: ${projects.reduce((sum, p) => sum + p.taskCount, 0)}`);
    console.log("Demo account: demo@taskflow.local");
    console.log(`Demo password: ${DEMO_PASSWORD}`);
    console.log("Teammate account: alex@taskflow.local (same password)");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
});
