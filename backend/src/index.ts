import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import cors from "cors";
import type { CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createHash, randomBytes, randomInt } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { Server } from "socket.io";
import nodemailer from "nodemailer";
import multer from "multer";
import { applyMigrations } from "./migrate.js";
import { allowedStatuses, canTransition, STATUSES, transitionError } from "./workflow.js";

interface JwtUser {
  sub: string;
  name: string;
}
const {
  DATABASE_URL,
  JWT_SECRET,
  PORT = "4000",
  FRONTEND_URL = "http://localhost:3000",
  APP_URL = FRONTEND_URL.split(",")[0]?.trim() || "http://localhost:3000",
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM = SMTP_USER,
} = process.env;
if (!DATABASE_URL || !JWT_SECRET)
  throw new Error("Set DATABASE_URL and JWT_SECRET in .env");

const databaseUrl = DATABASE_URL;
const useSsl = !/localhost|127\.0\.0\.1/i.test(databaseUrl) && process.env.DATABASE_SSL !== "disable";
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : false,
});
const q = (t: string, p?: unknown[]) => pool.query(t, p);
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;
// ── File upload storage ───────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Set<string> = new Set([
  "image/jpeg","image/png","image/gif","image/webp","image/svg+xml",
  "application/pdf","text/plain","text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip","application/x-zip-compressed",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, _file, cb) => cb(null, `${randomBytes(16).toString("hex")}`),
});
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
async function sendEmail(to: string, subject: string, text: string, html: string) {
  if (!mailer || !SMTP_FROM) throw new Error("Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.");
  await mailer.sendMail({ from: SMTP_FROM, to, subject, text, html });
}
const app = express();
const server = http.createServer(app);
const configuredOrigins = new Set(
  FRONTEND_URL.split(",").map((origin) => origin.trim()),
);
const isLocalFrontendOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" || url.port !== "3000") return false;
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]")
      return true;
    const octets = host.split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => part < 0 || part > 255))
      return false;
    return (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  } catch {
    return false;
  }
};
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(
      null,
      !origin || configuredOrigins.has(origin) || isLocalFrontendOrigin(origin),
    );
  },
};
const io = new Server(server, { cors: corsOptions });

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

const sign = (id: string, name: string) =>
  jwt.sign({ sub: id, name } as JwtUser, JWT_SECRET, { expiresIn: "8h" });
const auth = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.locals.user = jwt.verify(
      (req.headers.authorization || "").replace("Bearer ", ""),
      JWT_SECRET,
    ) as JwtUser;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const me = (res: Response) => res.locals.user as JwtUser;
const routeId = (req: Request) => String(req.params.id ?? "");
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

app.get("/health", (_req, res) => res.json({ ok: true }));

const isMember = async (pid: string, uid: string) =>
  ((
    await q(
      `SELECT 1 FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = pm.user_id
       WHERE pm.project_id=$1 AND pm.user_id=$2`,
      [pid, uid],
    )
  ).rowCount ?? 0) > 0;
const workspaceRole = async (wid: string, uid: string) =>
  (await q("SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [wid, uid])).rows[0]?.role as string | undefined;
const canManageWorkspace = async (wid: string, uid: string) =>
  ["owner", "admin"].includes((await workspaceRole(wid, uid)) ?? "");
const requestedWorkspaceId = (req: Request) =>
  String(req.headers["x-workspace-id"] ?? req.query.workspace_id ?? "").trim() || null;
async function ensureWorkspace(userId: string, displayName: string) {
  const existing = (
    await q(
      `SELECT w.id, w.name FROM workspaces w
       JOIN workspace_members m ON m.workspace_id=w.id
       WHERE m.user_id=$1 ORDER BY w.created_at LIMIT 1`,
      [userId],
    )
  ).rows[0] as { id: string; name: string } | undefined;
  if (existing) return existing;
  const name = `${String(displayName || "Personal").trim().slice(0, 40)}'s workspace`;
  const workspace = (await q("INSERT INTO workspaces(name, owner_id) VALUES($1,$2) RETURNING id, name", [name, userId])).rows[0];
  await q("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace.id, userId]);
  return workspace as { id: string; name: string };
}
async function activeWorkspace(req: Request, res: Response): Promise<string | null> {
  const user = me(res);
  const requested = requestedWorkspaceId(req);
  const workspaceId = requested ?? (await q(
    `SELECT wm.workspace_id AS id FROM workspace_members wm
     WHERE wm.user_id=$1 ORDER BY wm.created_at, wm.workspace_id LIMIT 1`,
    [user.sub],
  )).rows[0]?.id ?? (await ensureWorkspace(user.sub, user.name)).id;
  if (!(await workspaceRole(workspaceId, user.sub))) {
    res.status(404).json({ error: "Workspace not found" });
    return null;
  }
  return workspaceId;
}
async function addToWorkspace(workspaceId: string, userId: string, role = "member") {
  await q(
    "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [workspaceId, userId, role],
  );
}
const projectRole = async (pid: string, uid: string) =>
  (await q(
    `SELECT pm.role FROM project_members pm
     JOIN projects p ON p.id=pm.project_id
     JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=pm.user_id
     WHERE pm.project_id=$1 AND pm.user_id=$2`,
    [pid, uid],
  )).rows[0]?.role as string | undefined;
const canManageProject = async (pid: string, uid: string) => ["owner", "admin"].includes((await projectRole(pid, uid)) ?? "");
async function logActivity(projectId: string, actorId: string, action: string, taskId: string | null = null, details: Record<string, unknown> = {}) {
  const event = (await q("INSERT INTO activity_events(project_id,actor_id,task_id,action,details) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *", [projectId, actorId, taskId, action, JSON.stringify(details)])).rows[0];
  const actorName = (await q("SELECT display_name FROM users WHERE id=$1", [actorId])).rows[0]?.display_name;
  io.to("project:" + projectId).emit("activity:new", { ...event, actor_name: actorName });
}

const TASK_SQL =
  "SELECT t.*, u.display_name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id";
const withWorkflow = (task: { status: string }) => ({ ...task, allowed_statuses: allowedStatuses(task.status) });
const fullTask = async (id: string) => {
  const task = (await q(TASK_SQL + " WHERE t.id=$1", [id])).rows[0];
  return task ? withWorkflow(task) : task;
};

async function notify(
  userId: string | null,
  actor: string,
  message: string,
  projectId: string,
  taskId: string | null,
) {
  if (!userId || userId === actor) return;
  const n = (
    await q(
      "INSERT INTO notifications(user_id,message,project_id,task_id) VALUES($1,$2,$3,$4) RETURNING *",
      [userId, message, projectId || null, taskId || null],
    )
  ).rows[0];
  io.to("user:" + userId).emit("notification", n);
}

// loads a task the caller may access
async function taskFor(req: Request, res: Response) {
  const t = (await q("SELECT * FROM tasks WHERE id=$1", [routeId(req)]))
    .rows[0];
  if (!t || !(await isMember(t.project_id, me(res).sub))) {
    res.status(404).json({ error: "Task not found" });
    return null;
  }
  return t;
}

// auth
app.post(
  "/api/register",
  limiter,
  h(async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (
      !/^\S+@\S+\.\S+$/.test(email ?? "") ||
      (password ?? "").length < 8 ||
      !(name ?? "").trim()
    )
      return res
        .status(400)
        .json({ error: "Valid name, email and 8+ char password required" });

    try {
      const u = (
        await q(
          "INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,display_name",
          [
          email.trim().toLowerCase(),
            name.trim().slice(0, 40),
            await bcrypt.hash(password, 12),
          ],
        )
      ).rows[0];
      const workspace = await ensureWorkspace(u.id, u.display_name);
      return res.status(201).json({
        token: sign(u.id, u.display_name),
        user: { id: u.id, name: u.display_name },
        workspace,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        return res.status(400).json({ error: "Email already in use" });
      throw error;
    }
  }),
);

app.post(
  "/api/login",
  limiter,
  h(async (req, res) => {
    const { email, password } = req.body ?? {};
    const u = (
      await q("SELECT * FROM users WHERE email=$1", [
        String(email ?? "").trim().toLowerCase(),
      ])
    ).rows[0];
    if (!u || !(await bcrypt.compare(String(password ?? ""), u.password_hash)))
      return res.status(401).json({ error: "Invalid credentials" });

    const workspace = await ensureWorkspace(u.id, u.display_name);
    res.json({
      token: sign(u.id, u.display_name),
      user: { id: u.id, name: u.display_name },
      workspace,
    });
  }),
);

const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
app.post(
  "/api/password/forgot",
  passwordResetLimiter,
  h(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
    const user = (await q("SELECT id,email,display_name FROM users WHERE email=$1", [email])).rows[0];
    if (user && mailer && SMTP_FROM) {
      const token = randomBytes(32).toString("hex");
      const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
      await q("DELETE FROM password_resets WHERE user_id=$1 OR expires_at < now()", [user.id]);
      await q("INSERT INTO password_resets(user_id,token_hash,otp_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')", [user.id, hashToken(token), hashToken(otp)]);
      const resetUrl = `${APP_URL.replace(/\/$/, "")}/reset-password?token=${token}`;
      try {
        await sendEmail(user.email, "Your Taskflow password reset code and link", `Hi ${user.display_name},\n\nYour one-time Taskflow verification code is ${otp}. It expires in 30 minutes and can be tried up to 5 times.\n\nOr use this one-time reset link: ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
          `<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#272438"><div style="font-size:22px;font-weight:700;color:#5142c8;margin-bottom:24px">Taskflow</div><div style="background:#f5f3ff;border-radius:14px;padding:28px"><h1 style="font-size:25px;margin:0 0 12px">Reset your password</h1><p style="font-size:15px;line-height:1.6;color:#625e73">Hi ${escapeHtml(user.display_name)}, enter this one-time code or use your secure reset link.</p><div style="font-size:30px;letter-spacing:8px;font-weight:800;background:#fff;border-radius:10px;padding:16px;text-align:center;color:#5142c8">${otp}</div><p style="font-size:12px;color:#777286">The code expires in 30 minutes and allows up to 5 attempts.</p><a href="${resetUrl}" style="display:inline-block;background:#5142c8;color:#fff;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:bold;margin-top:8px">Reset password with link</a><p style="font-size:12px;color:#777286;margin-top:22px">If you didn't ask to reset your password, you can ignore this email.</p></div></div>`);
      } catch (error) {
        await q("DELETE FROM password_resets WHERE token_hash=$1", [hashToken(token)]);
        console.error("Password reset email failed:", error);
      }
    } else if (user) {
      console.error("Password reset requested but SMTP is not configured.");
    }
    // The same response for existing and unknown emails prevents account discovery.
    res.json({ message: "If an account exists for that email, a password reset link will arrive shortly." });
  }),
);

app.post(
  "/api/password/reset",
  passwordResetLimiter,
  h(async (req, res) => {
    const token = String(req.body?.token ?? "");
    const password = String(req.body?.password ?? "");
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const otp = String(req.body?.otp ?? "").trim();
    const hasToken = /^[a-f0-9]{64}$/.test(token);
    const hasOtp = /^\d{6}$/.test(otp) && /^\S+@\S+\.\S+$/.test(email);
    if ((!hasToken && !hasOtp) || password.length < 8)
      return res.status(400).json({ error: "Use a valid reset link or email code, and a password with at least 8 characters" });
    const passwordHash = await bcrypt.hash(password, 12);
    const consumed = await q(
      `WITH consumed AS (DELETE FROM password_resets WHERE expires_at>now() AND ((token_hash=$1 AND $1<>'') OR (user_id=(SELECT id FROM users WHERE email=$2) AND otp_hash=$3 AND $3<>'' AND attempts<5)) RETURNING user_id),
       updated AS (UPDATE users SET password_hash=$4 WHERE id=(SELECT user_id FROM consumed) RETURNING id)
       SELECT id FROM updated`,
      [hasToken ? hashToken(token) : "", email, hasOtp ? hashToken(otp) : "", passwordHash],
    );
    if (!consumed.rowCount) {
      if (hasOtp) await q("UPDATE password_resets SET attempts=attempts+1 WHERE user_id=(SELECT id FROM users WHERE email=$1) AND expires_at>now() AND attempts<5", [email]);
      return res.status(400).json({ error: "That reset code or link is invalid, expired, or already used. Request a new one." });
    }
    res.json({ message: "Password updated. You can now sign in with your new password." });
  }),
);

app.get(
  "/api/me",
  auth,
  h(async (_req, res) => {
    const u = (await q("SELECT id,email,display_name,created_at FROM users WHERE id=$1", [me(res).sub])).rows[0];
    if (!u) return res.status(404).json({ error: "Account not found" });
    res.json(u);
  }),
);

app.patch(
  "/api/me",
  auth,
  h(async (req, res) => {
    const name = String(req.body?.display_name ?? "").trim().slice(0, 40);
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const currentPassword = String(req.body?.current_password ?? "");
    const newPassword = String(req.body?.new_password ?? "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ error: "Enter a valid name and email address" });
    const existing = (await q("SELECT id,email,display_name,password_hash FROM users WHERE id=$1", [me(res).sub])).rows[0];
    if (!existing) return res.status(404).json({ error: "Account not found" });
    if (newPassword && newPassword.length < 8)
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    if ((newPassword || email !== existing.email) && !(await bcrypt.compare(currentPassword, existing.password_hash)))
      return res.status(400).json({ error: "Enter your current password to change your email or password" });
    try {
      const updated = (await q(
        "UPDATE users SET display_name=$1,email=$2,password_hash=CASE WHEN $3::text IS NULL THEN password_hash ELSE $3 END WHERE id=$4 RETURNING id,email,display_name,created_at",
        [name, email, newPassword ? await bcrypt.hash(newPassword, 12) : null, existing.id],
      )).rows[0];
      res.json({ ...updated, token: sign(updated.id, updated.display_name) });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return res.status(400).json({ error: "That email address is already in use" });
      throw e;
    }
  }),
);

app.get(
  "/api/workspaces",
  auth,
  h(async (_req, res) => {
    res.json(
      (
        await q(
          `SELECT w.id, w.name, w.owner_id, w.created_at, m.role,
                  (SELECT count(*) FROM workspace_members wm WHERE wm.workspace_id=w.id)::int AS member_count,
                  (SELECT count(*) FROM projects p JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$1 WHERE p.workspace_id=w.id)::int AS project_count
           FROM workspaces w
           JOIN workspace_members m ON m.workspace_id=w.id
           WHERE m.user_id=$1
           ORDER BY w.created_at`,
          [me(res).sub],
        )
      ).rows,
    );
  }),
);
app.post(
  "/api/workspaces",
  auth,
  h(async (req, res) => {
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Workspace name is required" });
    const workspace = (await q("INSERT INTO workspaces(name, owner_id) VALUES($1,$2) RETURNING id, name, owner_id, created_at", [name, me(res).sub])).rows[0];
    await q("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace.id, me(res).sub]);
    res.status(201).json({ ...workspace, role: "owner" });
  }),
);
app.patch(
  "/api/workspaces/:id",
  auth,
  h(async (req, res) => {
    const wid = routeId(req);
    if (!(await canManageWorkspace(wid, me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Workspace name is required" });
    const updated = (await q("UPDATE workspaces SET name=$1 WHERE id=$2 RETURNING id, name, owner_id, created_at", [name, wid])).rows[0];
    res.json(updated);
  }),
);
app.get(
  "/api/workspaces/:id/members",
  auth,
  h(async (req, res) => {
    if (!(await workspaceRole(routeId(req), me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
    res.json(
      (
        await q(
          `SELECT u.id, u.display_name, u.email, m.role
           FROM workspace_members m JOIN users u ON u.id=m.user_id
           WHERE m.workspace_id=$1 ORDER BY m.role, u.display_name`,
          [routeId(req)],
        )
      ).rows,
    );
  }),
);
app.post(
  "/api/workspaces/:id/members",
  auth,
  h(async (req, res) => {
    const wid = routeId(req);
    if (!(await canManageWorkspace(wid, me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const role = String(req.body?.role ?? "member");
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
    if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Choose admin or member" });
    const user = (await q("SELECT id, display_name, email FROM users WHERE email=$1", [email])).rows[0];
    if (!user) return res.status(404).json({ error: "No user with that email exists" });
    await q(
      `INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)
       ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role
       WHERE workspace_members.role <> 'owner'`,
      [wid, user.id, role],
    );
    const workspace = (await q("SELECT name FROM workspaces WHERE id=$1", [wid])).rows[0];
    await notify(user.id, me(res).sub, `${me(res).name} added you to workspace "${workspace.name}"`, "", null);
    res.status(201).json({ ...user, role });
  }),
);
app.delete(
  "/api/workspaces/:id/members/:userId",
  auth,
  h(async (req, res) => {
    const wid = routeId(req);
    const userId = String(req.params.userId ?? "");
    const myRole = await workspaceRole(wid, me(res).sub);
    if (!myRole) return res.status(404).json({ error: "Workspace not found" });
    if (userId !== me(res).sub && !(await canManageWorkspace(wid, me(res).sub)))
      return res.status(403).json({ error: "You cannot remove this member" });
    const removed = await q(
      "DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id",
      [wid, userId],
    );
    if (!removed.rowCount) return res.status(404).json({ error: "Member not found or cannot be removed" });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/workspaces/:id/dashboard",
  auth,
  h(async (req, res) => {
    const wid = routeId(req);
    if (!(await workspaceRole(wid, me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
    const uid = me(res).sub;
    const stats = (
      await q(
        `WITH visible AS (
           SELECT t.* FROM tasks t
           JOIN projects p ON p.id=t.project_id
           JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
           WHERE p.workspace_id=$1 AND p.archived_at IS NULL
         )
         SELECT
           (SELECT count(*)::int FROM projects p JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2 WHERE p.workspace_id=$1 AND p.archived_at IS NULL) AS project_count,
           (SELECT count(*)::int FROM visible) AS task_count,
           (SELECT count(*)::int FROM visible WHERE status='done') AS done_count,
           (SELECT count(*)::int FROM visible WHERE status<>'done') AS open_count,
           (SELECT count(*)::int FROM visible WHERE due_date < CURRENT_DATE AND status<>'done') AS overdue_count,
           (SELECT count(*)::int FROM visible WHERE status='done' AND updated_at >= date_trunc('week', now())) AS completed_this_week,
           (SELECT COALESCE(sum(estimated_hours),0)::float FROM visible WHERE status<>'done') AS remaining_hours`,
        [wid, uid],
      )
    ).rows[0];
    const byStatus = (
      await q(
        `SELECT t.status, count(*)::int AS count
         FROM tasks t
         JOIN projects p ON p.id=t.project_id
         JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
         WHERE p.workspace_id=$1 AND p.archived_at IS NULL
         GROUP BY t.status`,
        [wid, uid],
      )
    ).rows;
    const byPriority = (
      await q(
        `SELECT t.priority, count(*)::int AS count
         FROM tasks t
         JOIN projects p ON p.id=t.project_id
         JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
         WHERE p.workspace_id=$1 AND p.archived_at IS NULL
         GROUP BY t.priority`,
        [wid, uid],
      )
    ).rows;
    const recent = (
      await q(
        `SELECT ae.id, ae.action, ae.details, ae.created_at, ae.project_id, p.name AS project_name,
                t.title AS task_title, u.display_name AS actor_name
         FROM activity_events ae
         JOIN projects p ON p.id=ae.project_id
         JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
         LEFT JOIN tasks t ON t.id=ae.task_id
         LEFT JOIN users u ON u.id=ae.actor_id
         WHERE p.workspace_id=$1
         ORDER BY ae.created_at DESC LIMIT 20`,
        [wid, uid],
      )
    ).rows;
    res.json({
      workspace_id: wid,
      stats,
      by_status: byStatus,
      by_priority: byPriority,
      recent,
    });
  }),
);
app.get(
  "/api/search",
  auth,
  h(async (req, res) => {
    const uid = me(res).sub;
    const workspaceId = await activeWorkspace(req, res);
    if (!workspaceId) return;
    const term = String(req.query.q ?? "").trim().slice(0, 120);
    const status = String(req.query.status ?? "");
    const priority = String(req.query.priority ?? "");
    const projectId = String(req.query.project_id ?? "");
    const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
    const rows = (
      await q(
        `SELECT t.*, u.display_name AS assignee_name, p.name AS project_name, p.workspace_id
         FROM tasks t
         JOIN projects p ON p.id=t.project_id
         JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$1
         JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
         LEFT JOIN users u ON u.id=t.assignee_id
         WHERE ($2::uuid IS NULL OR p.workspace_id=$2)
           AND ($3::uuid IS NULL OR p.id=$3)
           AND ($4='' OR t.status=$4)
           AND ($5='' OR t.priority=$5)
           AND ($6='' OR t.title ILIKE $7 ESCAPE '\\' OR t.description ILIKE $7 ESCAPE '\\' OR EXISTS (
             SELECT 1 FROM unnest(t.tags) tag WHERE tag ILIKE $7 ESCAPE '\\'
           ))
         ORDER BY t.updated_at DESC
         LIMIT 75`,
        [uid, workspaceId, projectId || null, status, priority, term, like],
      )
    ).rows;
    res.json(rows);
  }),
);

// projects and members
app.get(
  "/api/projects",
  auth,
  h(async (req, res) => {
    const workspaceId = await activeWorkspace(req, res);
    if (!workspaceId) return;
    res.json(
      (
        await q(
          `SELECT p.*, (SELECT count(*) FROM tasks WHERE project_id=p.id)::int AS task_count FROM projects p
    JOIN project_members m ON m.project_id=p.id
    JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=m.user_id
    WHERE m.user_id=$1 AND ($2::uuid IS NULL OR p.workspace_id=$2) ORDER BY p.created_at DESC`,
          [me(res).sub, workspaceId],
        )
      ).rows,
    );
  }),
);

app.get(
  "/api/my-tasks",
  auth,
  h(async (req, res) => {
    const workspaceId = await activeWorkspace(req, res);
    if (!workspaceId) return;
    res.json((await q(
      `SELECT t.*,u.display_name AS assignee_name,p.name AS project_name
       FROM tasks t JOIN projects p ON p.id=t.project_id
       JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
       LEFT JOIN users u ON u.id=t.assignee_id
       WHERE t.assignee_id=$1 AND ($2::uuid IS NULL OR p.workspace_id=$2)
       ORDER BY t.due_date NULLS LAST,t.created_at DESC`,
      [me(res).sub, workspaceId],
    )).rows);
  }),
);

app.post(
  "/api/projects",
  auth,
  h(async (req, res) => {
    const name = String(req.body?.name ?? "")
      .trim()
      .slice(0, 80);
    const description = String(req.body?.description ?? "").trim().slice(0, 2000);

    if (!name) return res.status(400).json({ error: "Name is required" });
    const workspaceId = String(req.body?.workspace_id ?? requestedWorkspaceId(req) ?? "");
    const role = workspaceId ? await workspaceRole(workspaceId, me(res).sub) : undefined;
    if (!workspaceId || !role) return res.status(400).json({ error: "Choose a workspace you belong to" });

    const p = (
      await q("INSERT INTO projects(name,owner_id,description,workspace_id) VALUES($1,$2,$3,$4) RETURNING *", [
        name,
        me(res).sub,
        description,
        workspaceId,
      ])
    ).rows[0];
    await q(
      "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'owner')",
      [p.id, me(res).sub],
    );

    res.status(201).json(p);
  }),
);

app.get(
  "/api/projects/:id",
  auth,
  h(async (req, res) => {
    if (!(await isMember(routeId(req), me(res).sub)))
      return res.status(404).json({ error: "Project not found" });

    const project = (
      await q("SELECT p.id,p.name,p.description,p.owner_id,p.created_at,m.role AS my_role FROM projects p JOIN project_members m ON m.project_id=p.id AND m.user_id=$2 WHERE p.id=$1", [routeId(req), me(res).sub])
    ).rows[0];

    const members = (
      await q(
        "SELECT u.id,u.display_name,u.email,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1",
        [routeId(req)],
      )
    ).rows;

    const tasks = (
      await q(TASK_SQL + " WHERE t.project_id=$1 ORDER BY t.created_at", [
        routeId(req),
      ])
    ).rows.map(withWorkflow);

    res.json({ project, members, tasks });
  }),
);

app.patch(
  "/api/projects/:id",
  auth,
  h(async (req, res) => {
    const pid = routeId(req);
    if (!(await canManageProject(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
    const project = (await q("SELECT * FROM projects WHERE id=$1", [pid])).rows[0];
    if (!project) return res.status(404).json({ error: "Project not found" });
    const name = "name" in req.body ? String(req.body.name ?? "").trim().slice(0, 80) : project.name;
    const description = "description" in req.body ? String(req.body.description ?? "").trim().slice(0, 2000) : project.description;
    const dueDate = "due_date" in req.body ? (req.body.due_date || null) : project.due_date;
    const archived = "archived" in req.body ? Boolean(req.body.archived) : project.archived_at !== null;
    if (!name) return res.status(400).json({ error: "Project name is required" });
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) return res.status(400).json({ error: "Use a valid due date" });
    const updated = (await q("UPDATE projects SET name=$1,description=$2,due_date=$3,archived_at=CASE WHEN $4 THEN COALESCE(archived_at,now()) ELSE NULL END WHERE id=$5 RETURNING *", [name, description, dueDate, archived, pid])).rows[0];
    await logActivity(pid, me(res).sub, archived === (project.archived_at !== null) ? "project.updated" : archived ? "project.archived" : "project.restored", null, { name });
    io.to("project:" + pid).emit("project:updated", updated);
    res.json(updated);
  }),
);

app.post(
  "/api/projects/:id/invites",
  auth,
  h(async (req, res) => {
    const pid = routeId(req);
    if (!(await canManageProject(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Enter an email address to send an invitation" });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
    if (!mailer || !SMTP_FROM) return res.status(503).json({ error: "Email is not configured yet. Set the SMTP settings in the backend environment." });
    const existingUser = (await q("SELECT id FROM users WHERE email=$1", [email])).rows[0];
    if (existingUser && await isMember(pid, existingUser.id)) return res.status(409).json({ error: "This person is already a project member" });
    const token = randomBytes(24).toString("hex");
    await q("INSERT INTO project_invites(project_id,email,token,created_by) VALUES($1,$2,$3,$4)", [pid, email, token, me(res).sub]);
    const project = (await q("SELECT name FROM projects WHERE id=$1", [pid])).rows[0];
    const inviter = escapeHtml(me(res).name);
    const projectName = escapeHtml(project.name);
    const inviteUrl = `${APP_URL.replace(/\/$/, "")}/signup?invite=${token}`;
    try {
      await sendEmail(email, `${me(res).name} invited you to ${project.name} on Taskflow`,
        `${me(res).name} invited you to collaborate on "${project.name}" in Taskflow.\n\nAccept the invitation: ${inviteUrl}\n\nThis invitation expires in 7 days.`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#272438"><div style="font-size:22px;font-weight:700;color:#5142c8;margin-bottom:24px">Taskflow</div><div style="background:#f5f3ff;border-radius:14px;padding:28px"><div style="font-size:12px;letter-spacing:1px;color:#6251c2;font-weight:bold">YOU'RE INVITED</div><h1 style="font-size:26px;margin:12px 0">Good work happens together.</h1><p style="font-size:16px;line-height:1.6;color:#625e73"><b>${inviter}</b> invited you to join <b>${projectName}</b> on Taskflow.</p><a href="${inviteUrl}" style="display:inline-block;background:#5142c8;color:#fff;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:bold;margin-top:8px">Accept invitation</a><p style="font-size:12px;color:#777286;margin-top:22px">This link is for ${escapeHtml(email)} and expires in 7 days.</p></div></div>`);
    } catch (error) {
      await q("DELETE FROM project_invites WHERE token=$1", [token]);
      console.error("Invitation email failed:", error);
      return res.status(502).json({ error: "The invitation email could not be sent. Check the SMTP settings and try again." });
    }
    res.status(201).json({ invite_url: `/signup?invite=${token}`, project_name: project.name, email });
  }),
);

app.post(
  "/api/invites/:token/accept",
  auth,
  h(async (req, res) => {
    const invite = (await q("SELECT * FROM project_invites WHERE token=$1 AND expires_at>now()", [String(req.params.token)])).rows[0];
    if (!invite) return res.status(404).json({ error: "This invite has expired or is no longer available" });
    const user = (await q("SELECT email,display_name FROM users WHERE id=$1", [me(res).sub])).rows[0];
    if (invite.email && invite.email !== user.email.toLowerCase()) return res.status(403).json({ error: "Sign in with the email address this invite was sent to" });
    const project = (await q("SELECT name FROM projects WHERE id=$1", [invite.project_id])).rows[0];
    await q("DELETE FROM project_invites WHERE id=$1", [invite.id]);
    await q("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING", [invite.project_id, me(res).sub]);
    const inviteWorkspace = (await q("SELECT workspace_id FROM projects WHERE id=$1", [invite.project_id])).rows[0];
    if (inviteWorkspace?.workspace_id) await addToWorkspace(inviteWorkspace.workspace_id, me(res).sub);
    io.to("project:" + invite.project_id).emit("member:added", { id: me(res).sub, display_name: user.display_name, email: user.email });
    await logActivity(invite.project_id, me(res).sub, "member.joined", null, { name: user.display_name });
    res.json({ project_id: invite.project_id, project_name: project.name });
  }),
);

app.post(
  "/api/projects/:id/members",
  auth,
  h(async (req, res) => {
    if (!(await canManageProject(routeId(req), me(res).sub)))
      return res.status(404).json({ error: "Project not found" });

    const u = (
      await q("SELECT id,display_name,email FROM users WHERE email=$1", [
        String(req.body?.email ?? "").toLowerCase(),
      ])
    ).rows[0];

    if (!u)
      return res.status(404).json({ error: "No user with that email exists" });

    await q(
      "INSERT INTO project_members(project_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [routeId(req), u.id],
    );
    const memberWorkspace = (await q("SELECT workspace_id FROM projects WHERE id=$1", [routeId(req)])).rows[0];
    if (memberWorkspace?.workspace_id) await addToWorkspace(memberWorkspace.workspace_id, u.id);

    const p = (
      await q("SELECT name FROM projects WHERE id=$1", [routeId(req)])
    ).rows[0];

    await notify(
      u.id,
      me(res).sub,
      `${me(res).name} added you to project "${p.name}"`,
      routeId(req),
      "",
    );

    io.to("project:" + routeId(req)).emit("member:added", u);
    await logActivity(routeId(req), me(res).sub, "member.added", null, { name: u.display_name });
    res.status(201).json(u);
  }),
);
app.patch(
  "/api/projects/:id/members/:userId",
  auth,
  h(async (req, res) => {
    const pid = routeId(req), userId = String(req.params.userId ?? ""), role = String(req.body?.role ?? "");
    if ((await projectRole(pid, me(res).sub)) !== "owner") return res.status(403).json({ error: "Only the project owner can change member roles" });
    if (!["admin", "member", "viewer"].includes(role)) return res.status(400).json({ error: "Choose admin, member, or viewer" });
    const member = (await q("UPDATE project_members SET role=$1 WHERE project_id=$2 AND user_id=$3 AND role<>'owner' RETURNING user_id,role", [role,pid,userId])).rows[0];
    if (!member) return res.status(404).json({ error: "Project member not found" });
    await logActivity(pid,me(res).sub,"member.role_changed",null,{user_id:userId,role});
    io.to("project:"+pid).emit("member:role_changed",{user_id:userId,role});
    res.json(member);
  }),
);
app.delete(
  "/api/projects/:id/members/:userId",
  auth,
  h(async (req, res) => {
    const pid = routeId(req), userId = String(req.params.userId ?? "");
    if (!(await canManageProject(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
    const removed = await q("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id", [pid,userId]);
    if (!removed.rowCount) return res.status(404).json({ error: "Member not found or cannot be removed" });
    await logActivity(pid,me(res).sub,"member.removed",null,{user_id:userId});
    io.to("project:"+pid).emit("member:removed",{user_id:userId});
    res.json({ok:true});
  }),
);

// Project-scoped community hub: posts, replies, reactions, and team activity.
app.get(
  "/api/community",
  auth,
  h(async (req, res) => {
    const filterProject = String(req.query.project_id ?? "");
    const workspaceId = await activeWorkspace(req, res);
    if (!workspaceId) return;
    if (filterProject && !(await isMember(filterProject, me(res).sub))) return res.status(404).json({ error: "Project not found" });
    const projects = (await q(
      `SELECT p.id,p.name,m.role FROM projects p JOIN project_members m ON m.project_id=p.id
       JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=m.user_id
       WHERE m.user_id=$1 AND ($2::uuid IS NULL OR p.workspace_id=$2) ORDER BY p.name`,
      [me(res).sub, workspaceId],
    )).rows;
    const posts = (await q(
      `SELECT cp.id,cp.project_id,p.name AS project_name,cp.author_id,u.display_name AS author_name,cp.body,cp.created_at,cp.updated_at,
       (SELECT count(*)::int FROM community_replies r WHERE r.post_id=cp.id) AS reply_count,
       (SELECT count(*)::int FROM community_reactions cr WHERE cr.post_id=cp.id) AS reaction_count,
       EXISTS(SELECT 1 FROM community_reactions cr WHERE cr.post_id=cp.id AND cr.user_id=$1) AS reacted
       FROM community_posts cp JOIN projects p ON p.id=cp.project_id
       LEFT JOIN users u ON u.id=cp.author_id
       JOIN project_members m ON m.project_id=cp.project_id AND m.user_id=$1
       JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
       WHERE ($2::uuid IS NULL OR cp.project_id=$2) AND ($3::uuid IS NULL OR p.workspace_id=$3) ORDER BY cp.created_at DESC LIMIT 100`,
      [me(res).sub, filterProject || null, workspaceId],
    )).rows;
    const activity = (await q(
      `SELECT ae.id,ae.project_id,p.name AS project_name,ae.task_id,t.title AS task_title,
       ae.action,ae.details,ae.created_at,u.display_name AS actor_name
       FROM activity_events ae JOIN projects p ON p.id=ae.project_id
       JOIN project_members m ON m.project_id=ae.project_id AND m.user_id=$1
       JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
       LEFT JOIN tasks t ON t.id=ae.task_id LEFT JOIN users u ON u.id=ae.actor_id
       WHERE ($2::uuid IS NULL OR ae.project_id=$2) AND ($3::uuid IS NULL OR p.workspace_id=$3) ORDER BY ae.created_at DESC LIMIT 100`,
      [me(res).sub, filterProject || null, workspaceId],
    )).rows;
    res.json({ projects, posts, activity });
  }),
);
app.post(
  "/api/community/posts",
  auth,
  h(async (req, res) => {
    const projectId = String(req.body?.project_id ?? "");
    if (!(await isMember(projectId, me(res).sub))) return res.status(404).json({ error: "Project not found" });
    if ((await projectRole(projectId, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot publish posts" });
    const body = String(req.body?.body ?? "").trim().slice(0, 4000);
    if (!body) return res.status(400).json({ error: "Write a message before posting" });
    const post = (await q(
      `INSERT INTO community_posts(project_id,author_id,body) VALUES($1,$2,$3)
       RETURNING id,project_id,author_id,body,created_at,updated_at`,
      [projectId, me(res).sub, body],
    )).rows[0];
    await logActivity(projectId, me(res).sub, "community.posted", null, { post_id: post.id });
    const projectName = await projectsNameForCommunity(projectId);
    const formatted = { ...post, project_name: projectName, author_name: me(res).name, reply_count: 0, reaction_count: 0, reacted: false };
    io.to("project:" + projectId).emit("community:post", formatted);
    const teammates = (await q("SELECT user_id FROM project_members WHERE project_id=$1 AND user_id<>$2", [projectId, me(res).sub])).rows as { user_id: string }[];
    for (const member of teammates) await notify(member.user_id, me(res).sub, `${me(res).name} posted in ${projectName}`, projectId, "");
    res.status(201).json(formatted);
  }),
);
async function projectsNameForCommunity(projectId: string) {
  return (await q("SELECT name FROM projects WHERE id=$1", [projectId])).rows[0]?.name as string;
}
app.get(
  "/api/community/posts/:id/replies",
  auth,
  h(async (req, res) => {
    const post = (await q("SELECT project_id FROM community_posts WHERE id=$1", [routeId(req)])).rows[0];
    if (!post || !(await isMember(post.project_id, me(res).sub))) return res.status(404).json({ error: "Post not found" });
    res.json((await q("SELECT r.id,r.post_id,r.author_id,r.body,r.created_at,u.display_name AS author_name FROM community_replies r LEFT JOIN users u ON u.id=r.author_id WHERE r.post_id=$1 ORDER BY r.created_at", [routeId(req)])).rows);
  }),
);
app.post(
  "/api/community/posts/:id/replies",
  auth,
  h(async (req, res) => {
    const post = (await q("SELECT id,project_id,author_id FROM community_posts WHERE id=$1", [routeId(req)])).rows[0];
    if (!post || !(await isMember(post.project_id, me(res).sub))) return res.status(404).json({ error: "Post not found" });
    if ((await projectRole(post.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot reply" });
    const body = String(req.body?.body ?? "").trim().slice(0, 2000);
    if (!body) return res.status(400).json({ error: "Write a reply first" });
    const reply = (await q("INSERT INTO community_replies(post_id,author_id,body) VALUES($1,$2,$3) RETURNING id,post_id,author_id,body,created_at", [post.id, me(res).sub, body])).rows[0];
    reply.author_name = me(res).name;
    await notify(post.author_id, me(res).sub, `${me(res).name} replied to your community post`, post.project_id, "");
    io.to("project:" + post.project_id).emit("community:reply", reply);
    res.status(201).json(reply);
  }),
);
app.post(
  "/api/community/posts/:id/reactions",
  auth,
  h(async (req, res) => {
    const post = (await q("SELECT project_id FROM community_posts WHERE id=$1", [routeId(req)])).rows[0];
    if (!post || !(await isMember(post.project_id, me(res).sub))) return res.status(404).json({ error: "Post not found" });
    const enabled = Boolean(req.body?.enabled);
    if (enabled) await q("INSERT INTO community_reactions(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [routeId(req), me(res).sub]);
    else await q("DELETE FROM community_reactions WHERE post_id=$1 AND user_id=$2", [routeId(req), me(res).sub]);
    const count = (await q("SELECT count(*)::int AS count FROM community_reactions WHERE post_id=$1", [routeId(req)])).rows[0].count as number;
    res.json({ reacted: enabled, reaction_count: count });
  }),
);
app.delete(
  "/api/community/posts/:id",
  auth,
  h(async (req, res) => {
    const post = (await q("SELECT id,project_id,author_id FROM community_posts WHERE id=$1", [routeId(req)])).rows[0];
    if (!post || !(await isMember(post.project_id, me(res).sub))) return res.status(404).json({ error: "Post not found" });
    const isOwner = (await q("SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND role IN ('owner','admin')", [post.project_id, me(res).sub])).rowCount;
    if (post.author_id !== me(res).sub && !isOwner) return res.status(403).json({ error: "Only the author or a project admin can delete this post" });
    await q("DELETE FROM community_posts WHERE id=$1", [post.id]);
    io.to("project:" + post.project_id).emit("community:post-deleted", { id: post.id });
    res.json({ ok: true });
  }),
);

// tasks
app.post(
  "/api/projects/:id/tasks",
  auth,
  h(async (req, res) => {
    const pid = routeId(req),
      { title, description = "", status = "todo", assignee_id = null, priority = "medium", start_date = null, due_date = null, estimated_hours = null } = req.body ?? {};
    if (!(await isMember(pid, me(res).sub)))
      return res.status(404).json({ error: "Project not found" });
    if ((await projectRole(pid, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot create tasks" });
    if (!String(title ?? "").trim() || !(STATUSES as readonly string[]).includes(status))
      return res.status(400).json({ error: "Valid title and status required" });
    if (status !== "backlog" && status !== "todo")
      return res.status(400).json({ error: "New tasks must start in Backlog or To do. Move them through the project workflow." });
    if (!["low", "medium", "high", "urgent"].includes(priority)) return res.status(400).json({ error: "Choose a valid priority" });
    if ([start_date, due_date].some((date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))) return res.status(400).json({ error: "Use valid start and due dates" });
    if (estimated_hours !== null && (!Number.isFinite(Number(estimated_hours)) || Number(estimated_hours) < 0 || Number(estimated_hours) > 10000)) return res.status(400).json({ error: "Effort must be between 0 and 10,000 hours" });
    const tags = Array.isArray(req.body?.tags) ? [...new Set(req.body.tags.map((tag: unknown) => String(tag).trim().slice(0, 30)).filter(Boolean))].slice(0, 10) : [];
    if (assignee_id && !(await isMember(pid, assignee_id)))
      return res
        .status(400)
        .json({ error: "Assignee must be a project member" });
    const id = (
      await q(
        "INSERT INTO tasks(project_id,title,description,status,priority,start_date,due_date,estimated_hours,tags,assignee_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
        [
          pid,
          String(title).trim().slice(0, 200),
          String(description).trim().slice(0, 5000),
          status,
          priority,
          start_date || null,
          due_date || null,
          estimated_hours || null,
          tags,
          assignee_id,
          me(res).sub,
        ],
      )
    ).rows[0].id;
    const t = await fullTask(id);
    await logActivity(pid, me(res).sub, "task.created", id, { title: t.title });
    io.to("project:" + pid).emit("task:created", t);
    await notify(
      assignee_id,
      me(res).sub,
      `${me(res).name} assigned you "${t.title}"`,
      pid,
      id,
    );
    res.status(201).json(t);
  }),
);
app.patch(
  "/api/tasks/:id",
  auth,
  h(async (req, res) => {
    const old = await taskFor(req, res);
    if (!old) return;
    if ((await projectRole(old.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot edit tasks" });
    const b = req.body ?? {},
      sets: string[] = [],
      vals: unknown[] = [];
    for (const k of ["title", "description", "status", "assignee_id", "priority", "start_date", "due_date", "estimated_hours", "tags"]) {
      if (!(k in b)) continue;
      let v = b[k];
      if (k === "status") {
        if (!(STATUSES as readonly string[]).includes(v))
          return res.status(400).json({ error: "Bad status" });
        if (!canTransition(old.status, v))
          return res.status(400).json({ error: transitionError(old.status, v) });
      }
      if (k === "priority" && !["low", "medium", "high", "urgent"].includes(v))
        return res.status(400).json({ error: "Bad priority" });
      if (k === "due_date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
        return res.status(400).json({ error: "Use a valid due date" });
      if (k === "start_date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
        return res.status(400).json({ error: "Use a valid start date" });
      if (["due_date", "start_date"].includes(k)) v = v || null;
      if (k === "estimated_hours") {
        v = v === "" || v === null ? null : Number(v);
        if (v !== null && (!Number.isFinite(v) || Number(v) < 0 || Number(v) > 10000)) return res.status(400).json({ error: "Effort must be between 0 and 10,000 hours" });
      }
      if (k === "tags") {
        if (!Array.isArray(v)) return res.status(400).json({ error: "Tags must be a list" });
        v = [...new Set(v.map((tag: unknown) => String(tag).trim().slice(0, 30)).filter(Boolean))].slice(0, 10);
      }
      if (k === "description") v = String(v ?? "").slice(0, 5000);
      if (k === "title" && !String(v).trim())
        return res.status(400).json({ error: "Title required" });
      if (k === "assignee_id") {
        v = v || null;
        if (v && !(await isMember(old.project_id, v)))
          return res
            .status(400)
            .json({ error: "Assignee must be a project member" });
      }
      vals.push(v);
      sets.push(`${k}=$${vals.length}`);
    }
    if (!sets.length)
      return res.status(400).json({ error: "Nothing to update" });
    await q(`UPDATE tasks SET ${sets.join(",")},updated_at=now() WHERE id=$${vals.length + 1}`, [
      ...vals,
      old.id,
    ]);
    const t = await fullTask(old.id);
    const changedFields = Object.fromEntries(Object.keys(b).filter((key) => ["title", "description", "status", "assignee_id", "priority", "start_date", "due_date", "estimated_hours", "tags"].includes(key)).map((key) => [key, b[key]]));
    await logActivity(old.project_id, me(res).sub, b.status && b.status !== old.status ? "task.status_changed" : "task.updated", old.id, { title: t.title, changes: changedFields });
    io.to("project:" + old.project_id).emit("task:updated", t);
    if ("assignee_id" in b && t.assignee_id !== old.assignee_id)
      await notify(
        t.assignee_id,
        me(res).sub,
        `${me(res).name} assigned you "${t.title}"`,
        old.project_id,
        old.id,
      );
    if ("status" in b && t.status !== old.status) {
      const statusMessage = `${me(res).name} moved "${t.title}" to ${String(t.status).replaceAll("_", " ")}`;
      await notify(t.created_by, me(res).sub, statusMessage, old.project_id, old.id);
      if (t.assignee_id !== t.created_by) await notify(t.assignee_id, me(res).sub, statusMessage, old.project_id, old.id);
      // fire automation rules for status changes
      const ws = (await q("SELECT workspace_id FROM projects WHERE id=$1", [old.project_id])).rows[0];
      if (ws) {
        runAutomations(ws.workspace_id, old.project_id, old.id, "status_changed", {
          new_status: t.status, old_status: old.status, priority: t.priority,
        }).catch((err) => console.error("Automation error:", (err as Error).message));
      }
    }
    res.json(t);
  }),
);
app.delete(
  "/api/tasks/:id",
  auth,
  h(async (req, res) => {
    const t = await taskFor(req, res);
    if (!t) return;
    if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot delete tasks" });
    await logActivity(t.project_id, me(res).sub, "task.deleted", null, { title: t.title });
    await q("DELETE FROM tasks WHERE id=$1", [t.id]);
    io.to("project:" + t.project_id).emit("task:deleted", { id: t.id });
    res.json({ ok: true });
  }),
);

// comments
app.get(
  "/api/tasks/:id/checklist",
  auth,
  h(async (req, res) => {
    const t = await taskFor(req, res);
    if (!t) return;
    res.json((await q("SELECT * FROM checklist_items WHERE task_id=$1 ORDER BY created_at", [t.id])).rows);
  }),
);
app.post(
  "/api/tasks/:id/checklist",
  auth,
  h(async (req, res) => {
    const t = await taskFor(req, res);
    if (!t) return;
    if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot edit the checklist" });
    const title = String(req.body?.title ?? "").trim().slice(0, 160);
    if (!title) return res.status(400).json({ error: "Checklist item is required" });
    const item = (await q("INSERT INTO checklist_items(task_id,title) VALUES($1,$2) RETURNING *", [t.id, title])).rows[0];
    res.status(201).json(item);
  }),
);
app.patch(
  "/api/checklist/:id",
  auth,
  h(async (req, res) => {
    const item = (await q("SELECT ci.*,t.project_id FROM checklist_items ci JOIN tasks t ON t.id=ci.task_id WHERE ci.id=$1", [routeId(req)])).rows[0];
    if (!item || !(await isMember(item.project_id, me(res).sub))) return res.status(404).json({ error: "Checklist item not found" });
    if ((await projectRole(item.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot edit the checklist" });
    const sets: string[] = [], vals: unknown[] = [];
    if ("completed" in (req.body ?? {})) { vals.push(Boolean(req.body.completed)); sets.push(`completed=$${vals.length}`); }
    if ("title" in (req.body ?? {})) {
      const title = String(req.body.title ?? "").trim().slice(0, 160);
      if (!title) return res.status(400).json({ error: "Checklist item is required" });
      vals.push(title); sets.push(`title=$${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(item.id);
    res.json((await q(`UPDATE checklist_items SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`, vals)).rows[0]);
  }),
);
app.delete(
  "/api/checklist/:id",
  auth,
  h(async (req, res) => {
    const item = (await q("SELECT ci.id,t.project_id FROM checklist_items ci JOIN tasks t ON t.id=ci.task_id WHERE ci.id=$1", [routeId(req)])).rows[0];
    if (!item || !(await isMember(item.project_id, me(res).sub))) return res.status(404).json({ error: "Checklist item not found" });
    if ((await projectRole(item.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot edit the checklist" });
    await q("DELETE FROM checklist_items WHERE id=$1", [item.id]);
    res.json({ ok: true });
  }),
);
const CM_SQL =
  "SELECT c.id,c.task_id,c.body,c.created_at,u.display_name AS name FROM comments c LEFT JOIN users u ON u.id=c.user_id";
app.get(
  "/api/tasks/:id/comments",
  auth,
  h(async (req, res) => {
    const t = await taskFor(req, res);
    if (!t) return;
    res.json(
      (await q(CM_SQL + " WHERE c.task_id=$1 ORDER BY c.created_at", [t.id]))
        .rows,
    );
  }),
);
app.post(
  "/api/tasks/:id/comments",
  auth,
  h(async (req, res) => {
    const t = await taskFor(req, res);
    if (!t) return;
    if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Your project role cannot comment" });
    const body = String(req.body?.body ?? "")
      .trim()
      .slice(0, 2000);
    if (!body) return res.status(400).json({ error: "Comment required" });
    const id = (
      await q(
        "INSERT INTO comments(task_id,user_id,body) VALUES($1,$2,$3) RETURNING id",
        [t.id, me(res).sub, body],
      )
    ).rows[0].id;
    const c = (await q(CM_SQL + " WHERE c.id=$1", [id])).rows[0];
    await logActivity(t.project_id, me(res).sub, "task.commented", t.id, { title: t.title, comment: body.slice(0, 160) });
    io.to("project:" + t.project_id).emit("comment:new", c);
    const msg = `${me(res).name} commented on "${t.title}"`;
    await notify(t.assignee_id, me(res).sub, msg, t.project_id, t.id);
    if (t.created_by !== t.assignee_id)
      await notify(t.created_by, me(res).sub, msg, t.project_id, t.id);
    res.status(201).json(c);
  }),
);

// notifications
app.get(
  "/api/notifications",
  auth,
  h(async (_req, res) => {
    res.json(
      (
        await q(
          "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
          [me(res).sub],
        )
      ).rows,
    );
  }),
);
app.patch(
  "/api/notifications/:id/read",
  auth,
  h(async (req, res) => {
    const updated = await q(
      "UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2 RETURNING id,read",
      [routeId(req), me(res).sub],
    );
    if (!updated.rowCount) return res.status(404).json({ error: "Notification not found" });
    res.json(updated.rows[0]);
  }),
);
app.post(
  "/api/notifications/read",
  auth,
  h(async (_req, res) => {
    await q(
      "UPDATE notifications SET read=true WHERE user_id=$1 AND NOT read",
      [me(res).sub],
    );
    res.json({ ok: true });
  }),
);

// ── Serve uploaded files (private – membership checked) ───────
app.get(
  "/uploads/:stored",
  auth,
  h(async (req, res) => {
    const stored = path.basename(String(req.params.stored ?? ""));
    const att = (await q("SELECT a.*,t.project_id FROM attachments a JOIN tasks t ON t.id=a.task_id WHERE a.stored_name=$1", [stored])).rows[0];
    if (!att || !(await isMember(att.project_id, me(res).sub))) return res.status(404).json({ error: "Attachment not found" });
    const file = path.join(UPLOADS_DIR, stored);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "File not found on disk" });
    res.setHeader("Content-Disposition", `attachment; filename="${att.filename.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", att.mime_type);
    res.sendFile(file);
  }),
);

// ── Attachments ───────────────────────────────────────────────
app.get("/api/tasks/:id/attachments", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  res.json((await q("SELECT id,filename,mime_type,size_bytes,created_at,uploaded_by FROM attachments WHERE task_id=$1 ORDER BY created_at", [t.id])).rows);
}));

app.post("/api/tasks/:id/attachments", auth, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError || err instanceof Error) {
      res.status(400).json({ error: err.message }); return;
    }
    next();
  });
}, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Viewers cannot upload attachments" });
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  const att = (await q(
    "INSERT INTO attachments(task_id,project_id,uploaded_by,filename,stored_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [t.id, t.project_id, me(res).sub, file.originalname.slice(0,200), file.filename, file.mimetype, file.size],
  )).rows[0];
  await logActivity(t.project_id, me(res).sub, "task.attachment_added", t.id, { title: t.title, filename: file.originalname });
  res.status(201).json(att);
}));

app.delete("/api/attachments/:id", auth, h(async (req, res) => {
  const att = (await q("SELECT a.*,t.project_id FROM attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1", [routeId(req)])).rows[0];
  if (!att || !(await isMember(att.project_id, me(res).sub))) return res.status(404).json({ error: "Attachment not found" });
  if (att.uploaded_by !== me(res).sub && !(await canManageProject(att.project_id, me(res).sub)))
    return res.status(403).json({ error: "Only the uploader or a project admin can delete this attachment" });
  const file = path.join(UPLOADS_DIR, att.stored_name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  await q("DELETE FROM attachments WHERE id=$1", [att.id]);
  res.json({ ok: true });
}));

// ── Subtasks ──────────────────────────────────────────────────
app.get("/api/tasks/:id/subtasks", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  res.json((await q('SELECT * FROM subtasks WHERE task_id=$1 ORDER BY "order",created_at', [t.id])).rows);
}));

app.post("/api/tasks/:id/subtasks", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Viewers cannot add subtasks" });
  const title = String(req.body?.title ?? "").trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: "Subtask title required" });
  const item = (await q('INSERT INTO subtasks(task_id,title,"order") VALUES($1,$2,(SELECT COALESCE(MAX("order"),0)+1 FROM subtasks WHERE task_id=$1)) RETURNING *', [t.id, title])).rows[0];
  res.status(201).json(item);
}));

app.patch("/api/subtasks/:id", auth, h(async (req, res) => {
  const sub = (await q("SELECT s.*,t.project_id FROM subtasks s JOIN tasks t ON t.id=s.task_id WHERE s.id=$1", [routeId(req)])).rows[0];
  if (!sub || !(await isMember(sub.project_id, me(res).sub))) return res.status(404).json({ error: "Subtask not found" });
  if ((await projectRole(sub.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Viewers cannot edit subtasks" });
  const sets: string[] = [], vals: unknown[] = [];
  if ("completed" in (req.body ?? {})) { vals.push(Boolean(req.body.completed)); sets.push(`completed=$${vals.length}`); }
  if ("title" in (req.body ?? {})) {
    const title = String(req.body.title ?? "").trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: "Subtask title required" });
    vals.push(title); sets.push(`title=$${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  vals.push(sub.id);
  res.json((await q(`UPDATE subtasks SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`, vals)).rows[0]);
}));

app.delete("/api/subtasks/:id", auth, h(async (req, res) => {
  const sub = (await q("SELECT s.id,t.project_id FROM subtasks s JOIN tasks t ON t.id=s.task_id WHERE s.id=$1", [routeId(req)])).rows[0];
  if (!sub || !(await isMember(sub.project_id, me(res).sub))) return res.status(404).json({ error: "Subtask not found" });
  if ((await projectRole(sub.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Viewers cannot delete subtasks" });
  await q("DELETE FROM subtasks WHERE id=$1", [sub.id]);
  res.json({ ok: true });
}));

// ── Task dependencies ─────────────────────────────────────────
app.get("/api/tasks/:id/dependencies", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  const blockers = (await q(
    `SELECT td.depends_on_id AS id, t2.title, t2.status FROM task_dependencies td JOIN tasks t2 ON t2.id=td.depends_on_id WHERE td.task_id=$1`,
    [t.id],
  )).rows;
  const dependents = (await q(
    `SELECT td.task_id AS id, t2.title, t2.status FROM task_dependencies td JOIN tasks t2 ON t2.id=td.task_id WHERE td.depends_on_id=$1`,
    [t.id],
  )).rows;
  res.json({ blockers, dependents });
}));

app.post("/api/tasks/:id/dependencies", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Viewers cannot manage dependencies" });
  const depId = String(req.body?.depends_on_id ?? "");
  if (!depId) return res.status(400).json({ error: "depends_on_id required" });
  if (depId === t.id) return res.status(400).json({ error: "A task cannot depend on itself" });
  const dep = (await q("SELECT id,project_id,status FROM tasks WHERE id=$1", [depId])).rows[0];
  if (!dep || dep.project_id !== t.project_id) return res.status(404).json({ error: "Dependency task not found in this project" });
  // simple cycle check: the other task must not already depend on this one
  const cycle = (await q("SELECT 1 FROM task_dependencies WHERE task_id=$1 AND depends_on_id=$2", [depId, t.id])).rowCount;
  if (cycle) return res.status(409).json({ error: "Adding this dependency would create a cycle" });
  await q("INSERT INTO task_dependencies(task_id,depends_on_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [t.id, depId]);
  res.status(201).json({ task_id: t.id, depends_on_id: depId, title: dep.title ?? "", status: dep.status });
}));

app.delete("/api/tasks/:id/dependencies/:depId", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  if ((await projectRole(t.project_id, me(res).sub)) === "viewer") return res.status(403).json({ error: "Viewers cannot manage dependencies" });
  await q("DELETE FROM task_dependencies WHERE task_id=$1 AND depends_on_id=$2", [t.id, String(req.params.depId ?? "")]);
  res.json({ ok: true });
}));

// ── Task watchers ─────────────────────────────────────────────
app.get("/api/tasks/:id/watchers", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  res.json((await q("SELECT tw.user_id,u.display_name FROM task_watchers tw JOIN users u ON u.id=tw.user_id WHERE tw.task_id=$1", [t.id])).rows);
}));
app.post("/api/tasks/:id/watch", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  await q("INSERT INTO task_watchers(task_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [t.id, me(res).sub]);
  res.json({ watching: true });
}));
app.delete("/api/tasks/:id/watch", auth, h(async (req, res) => {
  const t = await taskFor(req, res); if (!t) return;
  await q("DELETE FROM task_watchers WHERE task_id=$1 AND user_id=$2", [t.id, me(res).sub]);
  res.json({ watching: false });
}));

// ── Milestones ────────────────────────────────────────────────
app.get("/api/projects/:id/milestones", auth, h(async (req, res) => {
  const pid = routeId(req);
  if (!(await isMember(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
  const rows = (await q(
    `SELECT m.*,
      (SELECT count(*)::int FROM tasks WHERE milestone_id=m.id) AS task_count,
      (SELECT count(*)::int FROM tasks WHERE milestone_id=m.id AND status='done') AS done_count
     FROM milestones m WHERE m.project_id=$1 ORDER BY m.due_date NULLS LAST, m.created_at`,
    [pid],
  )).rows;
  res.json(rows);
}));

app.post("/api/projects/:id/milestones", auth, h(async (req, res) => {
  const pid = routeId(req);
  if (!(await canManageProject(pid, me(res).sub))) return res.status(403).json({ error: "Only owners and admins can create milestones" });
  const title = String(req.body?.title ?? "").trim().slice(0, 200);
  const description = String(req.body?.description ?? "").trim().slice(0, 2000);
  const due_date = req.body?.due_date || null;
  if (!title) return res.status(400).json({ error: "Milestone title required" });
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) return res.status(400).json({ error: "Use a valid due date" });
  const m = (await q("INSERT INTO milestones(project_id,title,description,due_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *", [pid, title, description, due_date, me(res).sub])).rows[0];
  await logActivity(pid, me(res).sub, "milestone.created", null, { title });
  res.status(201).json(m);
}));

app.patch("/api/milestones/:id", auth, h(async (req, res) => {
  const m = (await q("SELECT * FROM milestones WHERE id=$1", [routeId(req)])).rows[0];
  if (!m || !(await isMember(m.project_id, me(res).sub))) return res.status(404).json({ error: "Milestone not found" });
  if (!(await canManageProject(m.project_id, me(res).sub))) return res.status(403).json({ error: "Only owners and admins can update milestones" });
  const title = "title" in req.body ? String(req.body.title ?? "").trim().slice(0,200) : m.title;
  const description = "description" in req.body ? String(req.body.description ?? "").trim().slice(0,2000) : m.description;
  const due_date = "due_date" in req.body ? (req.body.due_date || null) : m.due_date;
  const completed = "completed" in req.body ? Boolean(req.body.completed) : !!m.completed_at;
  if (!title) return res.status(400).json({ error: "Milestone title required" });
  const updated = (await q(
    "UPDATE milestones SET title=$1,description=$2,due_date=$3,completed_at=CASE WHEN $4 THEN COALESCE(completed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$5 RETURNING *",
    [title, description, due_date, completed, m.id],
  )).rows[0];
  res.json(updated);
}));

app.delete("/api/milestones/:id", auth, h(async (req, res) => {
  const m = (await q("SELECT project_id FROM milestones WHERE id=$1", [routeId(req)])).rows[0];
  if (!m || !(await isMember(m.project_id, me(res).sub))) return res.status(404).json({ error: "Milestone not found" });
  if (!(await canManageProject(m.project_id, me(res).sub))) return res.status(403).json({ error: "Only owners and admins can delete milestones" });
  await q("DELETE FROM milestones WHERE id=$1", [routeId(req)]);
  res.json({ ok: true });
}));

// ── Automation rules ──────────────────────────────────────────
app.get("/api/workspaces/:id/automations", auth, h(async (req, res) => {
  const wid = routeId(req);
  if (!(await workspaceRole(wid, me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
  res.json((await q(
    "SELECT ar.*,u.display_name AS creator_name FROM automation_rules ar LEFT JOIN users u ON u.id=ar.created_by WHERE ar.workspace_id=$1 ORDER BY ar.created_at DESC",
    [wid],
  )).rows);
}));

app.post("/api/workspaces/:id/automations", auth, h(async (req, res) => {
  const wid = routeId(req);
  if (!(await canManageWorkspace(wid, me(res).sub))) return res.status(403).json({ error: "Only workspace owners and admins can create automations" });
  const { name, trigger_type, trigger_config = {}, condition_config = {}, action_type, action_config = {}, project_id = null } = req.body ?? {};
  if (!String(name ?? "").trim()) return res.status(400).json({ error: "Automation name required" });
  const TRIGGER_TYPES = ["status_changed", "task_created", "deadline_approaching", "recurring"];
  const ACTION_TYPES  = ["assign_user", "notify", "change_status", "create_task"];
  if (!TRIGGER_TYPES.includes(String(trigger_type ?? ""))) return res.status(400).json({ error: "Invalid trigger_type" });
  if (!ACTION_TYPES.includes(String(action_type ?? "")))   return res.status(400).json({ error: "Invalid action_type" });
  if (project_id) {
    const proj = (await q("SELECT workspace_id FROM projects WHERE id=$1", [project_id])).rows[0];
    if (!proj || proj.workspace_id !== wid) return res.status(400).json({ error: "Project not in this workspace" });
  }
  const rule = (await q(
    "INSERT INTO automation_rules(workspace_id,project_id,name,trigger_type,trigger_config,condition_config,action_type,action_config,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9) RETURNING *",
    [wid, project_id, String(name).trim().slice(0,120), trigger_type, JSON.stringify(trigger_config), JSON.stringify(condition_config), action_type, JSON.stringify(action_config), me(res).sub],
  )).rows[0];
  res.status(201).json(rule);
}));

app.patch("/api/automations/:id", auth, h(async (req, res) => {
  const rule = (await q("SELECT * FROM automation_rules WHERE id=$1", [routeId(req)])).rows[0];
  if (!rule || !(await workspaceRole(rule.workspace_id, me(res).sub))) return res.status(404).json({ error: "Automation rule not found" });
  if (!(await canManageWorkspace(rule.workspace_id, me(res).sub))) return res.status(403).json({ error: "Only workspace owners and admins can update automations" });
  const name    = "name"    in req.body ? String(req.body.name ?? "").trim().slice(0,120) : rule.name;
  const enabled = "enabled" in req.body ? Boolean(req.body.enabled) : rule.enabled;
  const updated = (await q("UPDATE automation_rules SET name=$1,enabled=$2,updated_at=now() WHERE id=$3 RETURNING *", [name, enabled, rule.id])).rows[0];
  res.json(updated);
}));

app.delete("/api/automations/:id", auth, h(async (req, res) => {
  const rule = (await q("SELECT workspace_id FROM automation_rules WHERE id=$1", [routeId(req)])).rows[0];
  if (!rule || !(await workspaceRole(rule.workspace_id, me(res).sub))) return res.status(404).json({ error: "Automation rule not found" });
  if (!(await canManageWorkspace(rule.workspace_id, me(res).sub))) return res.status(403).json({ error: "Only workspace owners and admins can delete automations" });
  await q("DELETE FROM automation_rules WHERE id=$1", [routeId(req)]);
  res.json({ ok: true });
}));

// GET automation logs for a rule
app.get("/api/automations/:id/logs", auth, h(async (req, res) => {
  const rule = (await q("SELECT workspace_id FROM automation_rules WHERE id=$1", [routeId(req)])).rows[0];
  if (!rule || !(await workspaceRole(rule.workspace_id, me(res).sub))) return res.status(404).json({ error: "Automation rule not found" });
  res.json((await q("SELECT * FROM automation_logs WHERE rule_id=$1 ORDER BY executed_at DESC LIMIT 50", [routeId(req)])).rows);
}));

// ── Recurring tasks ───────────────────────────────────────────
app.get("/api/projects/:id/recurring", auth, h(async (req, res) => {
  const pid = routeId(req);
  if (!(await isMember(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
  res.json((await q("SELECT * FROM recurring_tasks WHERE project_id=$1 ORDER BY created_at DESC", [pid])).rows);
}));

app.post("/api/projects/:id/recurring", auth, h(async (req, res) => {
  const pid = routeId(req);
  if (!(await canManageProject(pid, me(res).sub))) return res.status(403).json({ error: "Only owners and admins can create recurring tasks" });
  const { title, description = "", priority = "medium", assignee_id = null, estimated_hours = null, tags = [], frequency = "weekly", interval_count = 1, day_of_week = null, day_of_month = null } = req.body ?? {};
  const titleStr = String(title ?? "").trim().slice(0, 200);
  if (!titleStr) return res.status(400).json({ error: "Title required" });
  if (!["daily","weekly","monthly"].includes(String(frequency))) return res.status(400).json({ error: "frequency must be daily, weekly, or monthly" });
  const rt = (await q(
    "INSERT INTO recurring_tasks(project_id,title,description,priority,assignee_id,estimated_hours,tags,frequency,interval_count,day_of_week,day_of_month,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
    [pid, titleStr, String(description ?? "").trim().slice(0,5000), priority, assignee_id || null, estimated_hours || null, Array.isArray(tags) ? tags : [], frequency, Number(interval_count)||1, day_of_week ?? null, day_of_month ?? null, me(res).sub],
  )).rows[0];
  res.status(201).json(rt);
}));

app.patch("/api/recurring/:id", auth, h(async (req, res) => {
  const rt = (await q("SELECT * FROM recurring_tasks WHERE id=$1", [routeId(req)])).rows[0];
  if (!rt || !(await isMember(rt.project_id, me(res).sub))) return res.status(404).json({ error: "Recurring task not found" });
  if (!(await canManageProject(rt.project_id, me(res).sub))) return res.status(403).json({ error: "Only owners and admins can edit recurring tasks" });
  const active = "active" in req.body ? Boolean(req.body.active) : rt.active;
  const title  = "title"  in req.body ? String(req.body.title ?? "").trim().slice(0,200) || rt.title : rt.title;
  const updated = (await q("UPDATE recurring_tasks SET active=$1,title=$2,updated_at=now() WHERE id=$3 RETURNING *", [active, title, rt.id])).rows[0];
  res.json(updated);
}));

app.delete("/api/recurring/:id", auth, h(async (req, res) => {
  const rt = (await q("SELECT project_id FROM recurring_tasks WHERE id=$1", [routeId(req)])).rows[0];
  if (!rt || !(await isMember(rt.project_id, me(res).sub))) return res.status(404).json({ error: "Recurring task not found" });
  if (!(await canManageProject(rt.project_id, me(res).sub))) return res.status(403).json({ error: "Only owners and admins can delete recurring tasks" });
  await q("DELETE FROM recurring_tasks WHERE id=$1", [routeId(req)]);
  res.json({ ok: true });
}));

// ── Workspace invitations ─────────────────────────────────────
app.post("/api/workspaces/:id/invites", auth, h(async (req, res) => {
  const wid = routeId(req);
  if (!(await canManageWorkspace(wid, me(res).sub))) return res.status(403).json({ error: "Only workspace owners and admins can invite members" });
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const role  = String(req.body?.role ?? "member");
  if (!["admin","member"].includes(role)) return res.status(400).json({ error: "Role must be admin or member" });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (!mailer || !SMTP_FROM) return res.status(503).json({ error: "Email is not configured. Set SMTP settings in the backend environment." });
  const token = randomBytes(24).toString("hex");
  await q("INSERT INTO workspace_invites(workspace_id,email,token,role,created_by) VALUES($1,$2,$3,$4,$5)", [wid, email || null, token, role, me(res).sub]);
  const ws = (await q("SELECT name FROM workspaces WHERE id=$1", [wid])).rows[0];
  const inviteUrl = `${APP_URL.replace(/\/$/, "")}/signup?wsinvite=${token}`;
  if (email) {
    try {
      await sendEmail(email, `You're invited to join "${ws.name}" on Taskflow`,
        `${me(res).name} invited you to join the Taskflow workspace "${ws.name}" as ${role}.\n\nAccept: ${inviteUrl}\n\nThis link expires in 7 days.`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#272438"><div style="font-size:22px;font-weight:700;color:#5142c8;margin-bottom:24px">Taskflow</div><p><b>${escapeHtml(me(res).name)}</b> invited you to <b>${escapeHtml(ws.name)}</b> as ${escapeHtml(role)}.</p><a href="${inviteUrl}" style="display:inline-block;background:#5142c8;color:#fff;text-decoration:none;padding:13px 18px;border-radius:8px;font-weight:bold">Accept invitation</a></div>`,
      );
    } catch (err) {
      await q("DELETE FROM workspace_invites WHERE token=$1", [token]);
      console.error("Workspace invite email failed:", err);
      return res.status(502).json({ error: "Invitation email could not be sent. Check SMTP settings." });
    }
  }
  res.status(201).json({ invite_url: `/signup?wsinvite=${token}`, workspace_name: ws.name, email: email || null, role });
}));

app.post("/api/workspace-invites/:token/accept", auth, h(async (req, res) => {
  const inv = (await q("SELECT * FROM workspace_invites WHERE token=$1 AND expires_at>now()", [String(req.params.token)])).rows[0];
  if (!inv) return res.status(404).json({ error: "This invite has expired or is no longer available" });
  const user = (await q("SELECT email FROM users WHERE id=$1", [me(res).sub])).rows[0];
  if (inv.email && inv.email !== user.email.toLowerCase()) return res.status(403).json({ error: "Sign in with the email this invite was sent to" });
  await q("DELETE FROM workspace_invites WHERE id=$1", [inv.id]);
  await q("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [inv.workspace_id, me(res).sub, inv.role]);
  const ws = (await q("SELECT name FROM workspaces WHERE id=$1", [inv.workspace_id])).rows[0];
  res.json({ workspace_id: inv.workspace_id, workspace_name: ws?.name ?? "", role: inv.role });
}));

// ── Notification preferences ──────────────────────────────────
app.get("/api/notification-preferences", auth, h(async (_req, res) => {
  const rows = (await q("SELECT event_type,in_app,email_enabled FROM notification_preferences WHERE user_id=$1", [me(res).sub])).rows;
  // Return defaults merged with stored prefs
  const EVENT_TYPES = ["task.assigned","task.status_changed","comment","deadline","mention","member.added"];
  const defaults: Record<string, { in_app: boolean; email_enabled: boolean }> = {};
  for (const et of EVENT_TYPES) defaults[et] = { in_app: true, email_enabled: false };
  for (const row of rows) defaults[row.event_type] = { in_app: row.in_app, email_enabled: row.email_enabled };
  res.json(Object.entries(defaults).map(([event_type, prefs]) => ({ event_type, ...prefs })));
}));

app.patch("/api/notification-preferences", auth, h(async (req, res) => {
  const prefs = req.body?.preferences;
  if (!Array.isArray(prefs)) return res.status(400).json({ error: "preferences must be an array" });
  for (const pref of prefs) {
    const et = String(pref?.event_type ?? "");
    if (!et) continue;
    await q(
      "INSERT INTO notification_preferences(user_id,event_type,in_app,email_enabled) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,event_type) DO UPDATE SET in_app=EXCLUDED.in_app,email_enabled=EXCLUDED.email_enabled",
      [me(res).sub, et, Boolean(pref.in_app ?? true), Boolean(pref.email_enabled ?? false)],
    );
  }
  res.json({ ok: true });
}));

// ── Analytics / reporting ─────────────────────────────────────
app.get("/api/workspaces/:id/analytics", auth, h(async (req, res) => {
  const wid = routeId(req);
  if (!(await workspaceRole(wid, me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
  const uid = me(res).sub;
  const days = Math.min(365, Math.max(7, Number(req.query.days ?? 30)));

  // Task completions per day (last N days)
  const completionTrend = (await q(
    `SELECT DATE(ae.created_at) AS day, count(*)::int AS count
     FROM activity_events ae
     JOIN projects p ON p.id=ae.project_id
     JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
     WHERE p.workspace_id=$1 AND ae.action='task.status_changed'
       AND ae.details->>'changes' LIKE '%"status":"done"%'
       AND ae.created_at >= now() - ($3 || ' days')::interval
     GROUP BY 1 ORDER BY 1`,
    [wid, uid, days],
  )).rows;

  // Members workload: open tasks assigned to each user
  const workload = (await q(
    `SELECT u.id, u.display_name, count(*)::int AS open_tasks
     FROM tasks t
     JOIN projects p ON p.id=t.project_id
     JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
     JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$2
     JOIN users u ON u.id=t.assignee_id
     WHERE p.workspace_id=$1 AND t.status NOT IN ('done') AND t.assignee_id IS NOT NULL
     GROUP BY u.id, u.display_name ORDER BY open_tasks DESC LIMIT 20`,
    [wid, uid],
  )).rows;

  // Project progress (done / total per project)
  const projectProgress = (await q(
    `SELECT p.id, p.name,
       count(*)::int AS total_tasks,
       sum(CASE WHEN t.status='done' THEN 1 ELSE 0 END)::int AS done_tasks,
       sum(CASE WHEN t.due_date < CURRENT_DATE AND t.status<>'done' THEN 1 ELSE 0 END)::int AS overdue_tasks
     FROM tasks t
     JOIN projects p ON p.id=t.project_id
     JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
     WHERE p.workspace_id=$1 AND p.archived_at IS NULL
     GROUP BY p.id, p.name ORDER BY p.name`,
    [wid, uid],
  )).rows;

  // Deadline adherence: % tasks completed by their due date
  const adherence = (await q(
    `SELECT
       count(*) FILTER (WHERE t.status='done' AND t.due_date IS NOT NULL)::int AS completed_with_due,
       count(*) FILTER (WHERE t.due_date IS NOT NULL AND t.status<>'done' AND t.due_date < CURRENT_DATE)::int AS overdue,
       count(*) FILTER (WHERE t.status='done')::int AS total_done
     FROM tasks t
     JOIN projects p ON p.id=t.project_id
     JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
     WHERE p.workspace_id=$1`,
    [wid, uid],
  )).rows[0];

  res.json({ completion_trend: completionTrend, workload, project_progress: projectProgress, adherence, days });
}));

// CSV export for task list
app.get("/api/workspaces/:id/export/tasks.csv", auth, h(async (req, res) => {
  const wid = routeId(req);
  if (!(await workspaceRole(wid, me(res).sub))) return res.status(404).json({ error: "Workspace not found" });
  const uid = me(res).sub;
  const rows = (await q(
    `SELECT p.name AS project, t.title, t.status, t.priority, t.assignee_id,
       u.display_name AS assignee, t.due_date, t.start_date, t.estimated_hours,
       array_to_string(t.tags,';') AS tags, t.created_at, t.updated_at
     FROM tasks t
     JOIN projects p ON p.id=t.project_id
     JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
     JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$2
     LEFT JOIN users u ON u.id=t.assignee_id
     WHERE p.workspace_id=$1
     ORDER BY p.name, t.created_at`,
    [wid, uid],
  )).rows;

  const headers = ["project","title","status","priority","assignee","due_date","start_date","estimated_hours","tags","created_at","updated_at"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="taskflow-tasks-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
}));

// ── Task list with pagination & filters ───────────────────────
app.get("/api/projects/:id/tasks", auth, h(async (req, res) => {
  const pid = routeId(req);
  if (!(await isMember(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(10, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;
  const status   = String(req.query.status   ?? "");
  const priority = String(req.query.priority ?? "");
  const assignee = String(req.query.assignee ?? "");
  const q_str    = String(req.query.q ?? "").trim();
  const sort     = ["created_at","updated_at","due_date","priority"].includes(String(req.query.sort)) ? String(req.query.sort) : "created_at";
  const dir      = req.query.dir === "asc" ? "ASC" : "DESC";

  const priorityOrder = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";
  const orderClause = sort === "priority" ? `${priorityOrder} ${dir}` : `t.${sort} ${dir} NULLS LAST`;

  const like = q_str ? `%${q_str.replace(/[%_]/g,"\\$&")}%` : null;
  const result = (await q(
    `SELECT t.*,u.display_name AS assignee_name,
       (SELECT count(*)::int FROM subtasks s WHERE s.task_id=t.id) AS subtask_count,
       (SELECT count(*)::int FROM subtasks s WHERE s.task_id=t.id AND s.completed) AS subtask_done,
       (SELECT count(*)::int FROM attachments a WHERE a.task_id=t.id) AS attachment_count
     FROM tasks t
     LEFT JOIN users u ON u.id=t.assignee_id
     WHERE t.project_id=$1
       AND ($2='' OR t.status=$2)
       AND ($3='' OR t.priority=$3)
       AND ($4='' OR t.assignee_id=$4::uuid)
       AND ($5::text IS NULL OR (t.title ILIKE $6 ESCAPE '\\' OR t.description ILIKE $6 ESCAPE '\\'))
     ORDER BY ${orderClause}
     LIMIT $7 OFFSET $8`,
    [pid, status, priority, assignee, like ? "1" : null, like, limit, offset],
  )).rows.map(withWorkflow);

  const total = (await q(
    `SELECT count(*)::int AS total FROM tasks t WHERE t.project_id=$1
       AND ($2='' OR t.status=$2) AND ($3='' OR t.priority=$3)
       AND ($4='' OR t.assignee_id=$4::uuid)
       AND ($5::text IS NULL OR (t.title ILIKE $6 ESCAPE '\\' OR t.description ILIKE $6 ESCAPE '\\'))`,
    [pid, status, priority, assignee, like ? "1" : null, like],
  )).rows[0].total as number;

  res.json({ tasks: result, total, page, limit, pages: Math.ceil(total / limit) });
}));

// ── Single task with full detail ──────────────────────────────
app.get("/api/tasks/:id", auth, h(async (req, res) => {
  const t = await taskFor(req, res);
  if (!t) return;
  const full = await fullTask(t.id);
  const [checklist, comments, subtasks, attachments_list, watchers, deps] = await Promise.all([
    q("SELECT * FROM checklist_items WHERE task_id=$1 ORDER BY created_at", [t.id]),
    q("SELECT c.id,c.task_id,c.body,c.created_at,c.parent_id,u.display_name AS name FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.task_id=$1 ORDER BY c.created_at", [t.id]),
    q('SELECT * FROM subtasks WHERE task_id=$1 ORDER BY "order",created_at', [t.id]),
    q("SELECT id,filename,mime_type,size_bytes,created_at FROM attachments WHERE task_id=$1 ORDER BY created_at", [t.id]),
    q("SELECT tw.user_id,u.display_name FROM task_watchers tw JOIN users u ON u.id=tw.user_id WHERE tw.task_id=$1", [t.id]),
    q(`SELECT td.depends_on_id AS id, t2.title, t2.status FROM task_dependencies td JOIN tasks t2 ON t2.id=td.depends_on_id WHERE td.task_id=$1`, [t.id]),
  ]);
  res.json({
    ...full,
    checklist: checklist.rows,
    comments: comments.rows,
    subtasks: subtasks.rows,
    attachments: attachments_list.rows,
    watchers: watchers.rows,
    blockers: deps.rows,
  });
}));

// ── Project activity feed ──────────────────────────────────────
app.get("/api/projects/:id/activity", auth, h(async (req, res) => {
  const pid = routeId(req);
  if (!(await isMember(pid, me(res).sub))) return res.status(404).json({ error: "Project not found" });
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(10, Number(req.query.limit ?? 40)));
  const rows = (await q(
    `SELECT ae.*,u.display_name AS actor_name,t.title AS task_title
     FROM activity_events ae
     LEFT JOIN users u ON u.id=ae.actor_id
     LEFT JOIN tasks t ON t.id=ae.task_id
     WHERE ae.project_id=$1
     ORDER BY ae.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pid, limit, (page-1)*limit],
  )).rows;
  const total = (await q("SELECT count(*)::int AS n FROM activity_events WHERE project_id=$1", [pid])).rows[0].n as number;
  res.json({ activity: rows, total, page, limit });
}));

// ── "My tasks" with richer filtering ─────────────────────────
app.get("/api/my-tasks/overdue", auth, h(async (req, res) => {
  const workspaceId = await activeWorkspace(req, res);
  if (!workspaceId) return;
  res.json((await q(
    `SELECT t.*,u.display_name AS assignee_name,p.name AS project_name
     FROM tasks t JOIN projects p ON p.id=t.project_id
     JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
     LEFT JOIN users u ON u.id=t.assignee_id
     WHERE t.assignee_id=$1 AND t.due_date < CURRENT_DATE AND t.status NOT IN ('done')
       AND ($2::uuid IS NULL OR p.workspace_id=$2)
     ORDER BY t.due_date`,
    [me(res).sub, workspaceId],
  )).rows);
}));

app.get("/api/my-tasks/upcoming", auth, h(async (req, res) => {
  const workspaceId = await activeWorkspace(req, res);
  if (!workspaceId) return;
  res.json((await q(
    `SELECT t.*,u.display_name AS assignee_name,p.name AS project_name
     FROM tasks t JOIN projects p ON p.id=t.project_id
     JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
     LEFT JOIN users u ON u.id=t.assignee_id
     WHERE t.assignee_id=$1 AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7
       AND t.status NOT IN ('done')
       AND ($2::uuid IS NULL OR p.workspace_id=$2)
     ORDER BY t.due_date`,
    [me(res).sub, workspaceId],
  )).rows);
}));

// ── Calendar: tasks with dates (for calendar view) ────────────
app.get("/api/calendar", auth, h(async (req, res) => {
  const workspaceId = await activeWorkspace(req, res);
  if (!workspaceId) return;
  const from = String(req.query.from ?? "");
  const to   = String(req.query.to ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: "Provide from and to dates (YYYY-MM-DD)" });
  const rows = (await q(
    `SELECT t.id,t.title,t.status,t.priority,t.due_date,t.start_date,t.project_id,t.assignee_id,
       u.display_name AS assignee_name, p.name AS project_name
     FROM tasks t
     JOIN projects p ON p.id=t.project_id
     JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$3
     JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$3
     LEFT JOIN users u ON u.id=t.assignee_id
     WHERE p.workspace_id=$1
       AND (t.due_date BETWEEN $2::date AND $4::date OR t.start_date BETWEEN $2::date AND $4::date)
     ORDER BY t.due_date NULLS LAST, t.start_date NULLS LAST`,
    [workspaceId, from, me(res).sub, to],
  )).rows;
  res.json(rows);
}));

// ── Automation engine: run eligible rules ─────────────────────
// Internal helper – runs after task status changes
async function runAutomations(
  workspaceId: string, projectId: string, taskId: string,
  triggerType: string, context: Record<string, unknown>,
) {
  const rules = (await q(
    `SELECT * FROM automation_rules WHERE workspace_id=$1 AND enabled=true AND trigger_type=$2
       AND (project_id IS NULL OR project_id=$3)`,
    [workspaceId, triggerType, projectId],
  )).rows as Array<{ id: string; action_type: string; action_config: Record<string,unknown>; condition_config: Record<string,unknown> }>;

  for (const rule of rules) {
    try {
      // Evaluate conditions
      const cond = rule.condition_config as Record<string, unknown>;
      if (cond.status && cond.status !== context.new_status) continue;
      if (cond.priority && cond.priority !== context.priority) continue;

      // Execute action
      let message = "ok";
      if (rule.action_type === "notify") {
        const notifyUid = String(rule.action_config.user_id ?? "");
        const msg = String(rule.action_config.message ?? `Automation triggered on task`);
        if (notifyUid) await notify(notifyUid, "system", msg, projectId, taskId);
      } else if (rule.action_type === "change_status") {
        const newStatus = String(rule.action_config.status ?? "");
        if (newStatus && canTransition(String(context.new_status ?? ""), newStatus)) {
          await q("UPDATE tasks SET status=$1,updated_at=now() WHERE id=$2", [newStatus, taskId]);
          message = `status changed to ${newStatus}`;
        } else {
          message = `skipped – invalid transition to ${newStatus}`;
        }
      } else if (rule.action_type === "assign_user") {
        const assignUid = String(rule.action_config.user_id ?? "");
        if (assignUid) {
          await q("UPDATE tasks SET assignee_id=$1,updated_at=now() WHERE id=$2", [assignUid, taskId]);
          message = `assigned to ${assignUid}`;
        }
      } else if (rule.action_type === "create_task") {
        const followupTitle = String(rule.action_config.title ?? "Follow-up task");
        await q("INSERT INTO tasks(project_id,title,status,created_by) VALUES($1,$2,'todo',$3)", [projectId, followupTitle, null]);
        message = `created follow-up task "${followupTitle}"`;
      }
      await q("INSERT INTO automation_logs(rule_id,task_id,status,message) VALUES($1,$2,'ok',$3)", [rule.id, taskId, message]);
    } catch (err) {
      await q("INSERT INTO automation_logs(rule_id,task_id,status,message) VALUES($1,$2,'error',$3)", [rule.id, taskId, String((err as Error).message).slice(0,500)]).catch(() => {});
    }
  }
}

// ── Recurring task scheduler ──────────────────────────────────
// Runs on a 5-min interval; generates tasks when next_run_at <= today.
async function processRecurringTasks() {
  const due = (await q("SELECT * FROM recurring_tasks WHERE active=true AND next_run_at <= CURRENT_DATE")).rows as Array<{
    id: string; project_id: string; title: string; description: string; priority: string;
    assignee_id: string | null; estimated_hours: number | null; tags: string[];
    frequency: string; interval_count: number; day_of_week: number | null; day_of_month: number | null;
  }>;

  for (const rt of due) {
    try {
      await q(
        "INSERT INTO tasks(project_id,title,description,status,priority,assignee_id,estimated_hours,tags,created_by,recurring_task_id) VALUES($1,$2,$3,'todo',$4,$5,$6,$7,null,$8)",
        [rt.project_id, rt.title, rt.description, rt.priority, rt.assignee_id, rt.estimated_hours, rt.tags, rt.id],
      );
      // Compute next run date
      const freq = rt.frequency;
      const inc  = rt.interval_count;
      const next = (await q(
        `SELECT (CURRENT_DATE + ($1 || ' ' || $2)::interval)::date AS next_date`,
        [inc, freq === "daily" ? "days" : freq === "weekly" ? "weeks" : "months"],
      )).rows[0].next_date as string;
      await q("UPDATE recurring_tasks SET next_run_at=$1 WHERE id=$2", [next, rt.id]);
    } catch (err) {
      console.error(`Recurring task ${rt.id} failed:`, (err as Error).message);
    }
  }
}

// Kick off the scheduler only when not in test mode
if (process.env.NODE_ENV !== "test") {
  setInterval(() => { processRecurringTasks().catch((e) => console.error("Recurring scheduler error:", e.message)); }, 5 * 60 * 1000);
}

app.use(
  (
    e: { code?: string; message: string },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (e.code === "22P02") return res.status(404).json({ error: "Not found" }); // malformed UUID
    console.error(e);
    res.status(500).json({ error: "Server error" });
  },
);

// real time
io.use((s, next) => {
  try {
    s.data.user = jwt.verify(
      String(s.handshake.auth.token),
      JWT_SECRET,
    ) as JwtUser;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
io.on("connection", (s) => {
  const u: JwtUser = s.data.user;
  s.join("user:" + u.sub); // personal room for notifications
  s.on("watch", async (pid: string) => {
    try {
      if (await isMember(pid, u.sub)) s.join("project:" + pid);
    } catch {
      /* bad id */
    }
  });
  s.on("unwatch", (pid: string) => s.leave("project:" + pid));
});

export async function initDb() {
  await applyMigrations(pool, path.join(__dirname, "..", "migrations"));
}

export async function start() {
  await initDb();
  await new Promise<void>((resolve) => {
    server.listen(Number(PORT), () => resolve());
  });
  console.log(`API running on http://localhost:${PORT}`);
}

export { app, pool, server };

if (process.env.NODE_ENV !== "test") {
  start().catch((e) => {
    console.error("Startup failed:", e.message);
    process.exit(1);
  });
}
