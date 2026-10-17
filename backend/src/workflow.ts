export const STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
] as const;

export type TaskStatus = (typeof STATUSES)[number];

export const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ["todo"],
  todo: ["backlog", "in_progress"],
  in_progress: ["todo", "in_review", "blocked"],
  in_review: ["in_progress", "done", "blocked"],
  blocked: ["todo", "in_progress"],
  done: ["in_review"],
};

export function isStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isStatus(from) || !isStatus(to)) return false;
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function allowedStatuses(from: string): TaskStatus[] {
  if (!isStatus(from)) return [...STATUSES];
  return [from, ...TRANSITIONS[from]];
}

export function transitionError(from: string, to: string): string {
  const readable = (status: string) => status.replaceAll("_", " ");
  return `Tasks cannot move from ${readable(from)} to ${readable(to)}. Follow the project workflow.`;
}
