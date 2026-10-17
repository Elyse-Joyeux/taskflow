export type Status = "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";

export type User = {
  id: string;
  display_name: string;
  email?: string;
  role?: "owner" | "admin" | "member" | "viewer";
};

export type Workspace = {
  id: string;
  name: string;
  owner_id?: string;
  role?: "owner" | "admin" | "member";
  member_count?: number;
  project_count?: number;
};

export const WORKFLOW: Record<Status, Status[]> = {
  backlog: ["todo"],
  todo: ["backlog", "in_progress"],
  in_progress: ["todo", "in_review", "blocked"],
  in_review: ["in_progress", "done", "blocked"],
  blocked: ["todo", "in_progress"],
  done: ["in_review"],
};

export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: Status;
  assignee_id: string | null;
  assignee_name: string | null;
  priority: Priority;
  due_date: string | null;
  start_date: string | null;
  estimated_hours: number | null;
  tags: string[];
  allowed_statuses?: Status[];
  project_name?: string;
  milestone_id?: string | null;
  acceptance_criteria?: string;
  recurring_task_id?: string | null;
  // aggregates returned by paginated endpoint
  subtask_count?: number;
  subtask_done?: number;
  attachment_count?: number;
};

export type Subtask = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  order: number;
  created_at: string;
};

export type TaskDependency = {
  id: string;
  title: string;
  status: Status;
};

export type Attachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type Watcher = {
  user_id: string;
  display_name: string;
};

export type ChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  created_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  name: string;
  body: string;
  created_at: string;
  parent_id?: string | null;
};

export type Notif = {
  id: string;
  message: string;
  project_id: string;
  task_id: string;
  read: boolean;
  created_at: string;
};

export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  task_count: number;
  done_count: number;
};

export type AutomationRule = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  condition_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  created_at: string;
  creator_name?: string;
};

export type RecurringTask = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  priority: Priority;
  frequency: "daily" | "weekly" | "monthly";
  interval_count: number;
  next_run_at: string;
  active: boolean;
  created_at: string;
};

export type NotifPreference = {
  event_type: string;
  in_app: boolean;
  email_enabled: boolean;
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  "task.assigned": "Task assigned to you",
  "task.status_changed": "Task status changed",
  comment: "New comment on your task",
  deadline: "Deadline approaching",
  mention: "Mentioned in a comment",
  "member.added": "Added to a project or workspace",
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  status_changed: "Status changed",
  task_created: "Task created",
  deadline_approaching: "Deadline approaching",
  recurring: "Recurring schedule",
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  assign_user: "Assign user",
  notify: "Send notification",
  change_status: "Change status",
  create_task: "Create follow-up task",
};
