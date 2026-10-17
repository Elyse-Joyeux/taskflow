import { describe, expect, it } from "vitest";
import {
  allowedStatuses,
  canTransition,
  isStatus,
  STATUSES,
  transitionError,
} from "./workflow.js";

describe("task workflow", () => {
  it("accepts the six board statuses", () => {
    for (const status of STATUSES) expect(isStatus(status)).toBe(true);
    expect(isStatus("shipped")).toBe(false);
  });

  it("allows staying in the same column", () => {
    for (const status of STATUSES) expect(canTransition(status, status)).toBe(true);
  });

  it("enforces the happy path from backlog to done", () => {
    expect(canTransition("backlog", "todo")).toBe(true);
    expect(canTransition("todo", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "in_review")).toBe(true);
    expect(canTransition("in_review", "done")).toBe(true);
  });

  it("rejects skipped and reverse jumps that skip review", () => {
    expect(canTransition("backlog", "done")).toBe(false);
    expect(canTransition("todo", "done")).toBe(false);
    expect(canTransition("done", "todo")).toBe(false);
    expect(canTransition("blocked", "done")).toBe(false);
  });

  it("lets blocked work return to progress and reopen done work into review", () => {
    expect(canTransition("in_progress", "blocked")).toBe(true);
    expect(canTransition("blocked", "in_progress")).toBe(true);
    expect(canTransition("done", "in_review")).toBe(true);
  });

  it("lists only legal next statuses plus the current one", () => {
    expect(allowedStatuses("todo")).toEqual(["todo", "backlog", "in_progress"]);
  });

  it("explains illegal moves in plain language", () => {
    expect(transitionError("backlog", "done")).toMatch(/cannot move from backlog to done/i);
  });
});
