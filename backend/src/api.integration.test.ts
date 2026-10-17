import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.JWT_SECRET);

describe.skipIf(!enabled)("core authenticated workflows", () => {
  let app: Express;
  let pool: Pool;
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const aliceEmail = `alice-${stamp}@taskflow.test`;
  const bobEmail = `bob-${stamp}@taskflow.test`;
  const password = "password12";
  let aliceToken = "";
  let bobToken = "";
  let bobId = "";
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let taskId = "";

  beforeAll(async () => {
    const mod = await import("./index.js");
    await mod.initDb();
    app = mod.app;
    pool = mod.pool;
  });

  afterAll(async () => {
    if (!pool) return;
    const createdUsers = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email LIKE $1",
      [`%${stamp}@taskflow.test`],
    );
    const ids = createdUsers.rows.map((user) => user.id);
    if (ids.length) {
      await pool.query("DELETE FROM workspaces WHERE owner_id=ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [ids]);
    }
  });

  it("registers users into isolated personal workspaces", async () => {
    const alice = await request(app).post("/api/register").send({
      email: aliceEmail,
      password,
      name: "Alice",
    });
    const bob = await request(app).post("/api/register").send({
      email: bobEmail,
      password,
      name: "Bob",
    });
    expect(alice.status).toBe(201);
    expect(bob.status).toBe(201);
    expect(alice.body.user.id).toBeTruthy();
    expect(alice.body).not.toHaveProperty("password_hash");
    aliceToken = alice.body.token;
    bobToken = bob.body.token;
    bobId = bob.body.user.id;
    workspaceId = alice.body.workspace.id;
    otherWorkspaceId = bob.body.workspace.id;
    expect(workspaceId).toBeTruthy();
    expect(workspaceId).not.toBe(otherWorkspaceId);

    const login = await request(app).post("/api/login").send({
      email: aliceEmail,
      password,
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    const rejected = await request(app).post("/api/login").send({
      email: aliceEmail,
      password: "incorrect-password",
    });
    expect(rejected.status).toBe(401);
  });

  it("lets authorized members create projects and tasks", async () => {
    const project = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${aliceToken}`)
      .set("X-Workspace-Id", workspaceId)
      .send({ name: "Launch site", workspace_id: workspaceId });
    expect(project.status).toBe(201);
    projectId = project.body.id;
    const bypass = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ title: "Skip workflow", status: "done" });
    expect(bypass.status).toBe(400);
    const task = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ title: "Write homepage copy", status: "todo" });
    expect(task.status).toBe(201);
    taskId = task.body.id;
  });

  it("blocks other users from another workspace project", async () => {
    const peek = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${bobToken}`);
    expect(peek.status).toBe(404);
    const taskPeek = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Unauthorized change" });
    expect(taskPeek.status).toBe(404);
    const dashboard = await request(app)
      .get(`/api/workspaces/${workspaceId}/dashboard`)
      .set("Authorization", `Bearer ${bobToken}`);
    expect(dashboard.status).toBe(404);
    const isolatedSearch = await request(app)
      .get("/api/search")
      .query({ q: "homepage" })
      .set("Authorization", `Bearer ${bobToken}`)
      .set("X-Workspace-Id", otherWorkspaceId);
    expect(isolatedSearch.status).toBe(200);
    expect(isolatedSearch.body).toHaveLength(0);
  });

  it("moves tasks only through the validated workflow", async () => {
    const skipped = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ status: "done" });
    expect(skipped.status).toBe(400);
    const started = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ status: "in_progress" });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("in_progress");
  });

  it("searches and dashboards from live database rows", async () => {
    const search = await request(app)
      .get("/api/search")
      .query({ q: "homepage", workspace_id: workspaceId })
      .set("Authorization", `Bearer ${aliceToken}`)
      .set("X-Workspace-Id", workspaceId);
    expect(search.status).toBe(200);
    expect(search.body.some((row: { id: string }) => row.id === taskId)).toBe(true);
    const dashboard = await request(app)
      .get(`/api/workspaces/${workspaceId}/dashboard`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.stats.task_count).toBeGreaterThan(0);
    expect(dashboard.body.stats.project_count).toBeGreaterThan(0);
  });

  it("notifies a newly added teammate", async () => {
    const added = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ email: bobEmail });
    expect(added.status).toBe(201);
    const notes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(notes.status).toBe(200);
    expect(notes.body.some((item: { message: string }) => item.message.includes("Launch site"))).toBe(true);
    const visible = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${bobToken}`);
    expect(visible.status).toBe(200);
  });

  it("supports project community updates, replies, and reactions", async () => {
    const post = await request(app)
      .post("/api/community/posts")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ project_id: projectId, body: "Launch checklist is ready" });
    expect(post.status).toBe(201);

    const reply = await request(app)
      .post(`/api/community/posts/${post.body.id}/replies`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ body: "Thanks, I will review it" });
    expect(reply.status).toBe(201);

    const reaction = await request(app)
      .post(`/api/community/posts/${post.body.id}/reactions`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ enabled: true });
    expect(reaction.status).toBe(200);
    expect(reaction.body.reaction_count).toBe(1);

    const feed = await request(app)
      .get("/api/community")
      .set("Authorization", `Bearer ${aliceToken}`)
      .set("X-Workspace-Id", workspaceId);
    expect(feed.status).toBe(200);
    expect(feed.body.posts[0].reply_count).toBe(1);
  });

  it("keeps read-only project members from changing tasks", async () => {
    const role = await request(app)
      .patch(`/api/projects/${projectId}/members/${bobId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ role: "viewer" });
    expect(role.status).toBe(200);
    const update = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Viewer edit" });
    expect(update.status).toBe(403);
  });
});
