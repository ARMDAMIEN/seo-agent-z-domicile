import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DATA_DIR } from "../config.js";
import { resolve } from "node:path";

export const TASKS_JSON_PATH = resolve(DATA_DIR, "tasks.json");

export type TaskType =
  | "meta_rewrite"
  | "content_enrichment"
  | "internal_linking"
  | "create_seo_page"
  | "investigation";

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  created_at: string;
  created_by_run: string;
  type: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dedup_key: string;
  target_url?: string | null;
  completed_at?: string | null;
  completed_by_run?: string | null;
  commit_sha?: string | null;
  commit_urls?: string[] | null;
  notes?: string | null;
  blocked_reason?: string | null;
}

async function readAll(): Promise<Task[]> {
  if (!existsSync(TASKS_JSON_PATH)) return [];
  try {
    return JSON.parse(await readFile(TASKS_JSON_PATH, "utf8")) as Task[];
  } catch {
    return [];
  }
}

async function writeAll(tasks: Task[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TASKS_JSON_PATH, JSON.stringify(tasks, null, 2), "utf8");
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function getOpenTasks(limit?: number): Promise<{ tasks: Task[]; total_open: number; total_all: number }> {
  const all = await readAll();
  const open = all.filter((t) => t.status === "todo" || t.status === "in_progress");
  open.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.created_at.localeCompare(b.created_at);
  });
  return {
    tasks: limit ? open.slice(0, limit) : open,
    total_open: open.length,
    total_all: all.length,
  };
}

export async function getAllTasks(): Promise<{ tasks: Task[] }> {
  const all = await readAll();
  return { tasks: all };
}

function normalizeDedup(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface AddTaskInput {
  type: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  dedup_key: string;
  target_url?: string | null;
}

export async function addTasks(
  inputs: AddTaskInput[],
  run_id: string
): Promise<{
  added: Task[];
  skipped: Array<{ dedup_key: string; existing_id: string; reason: "open" | "recently_done" }>;
  total_open: number;
}> {
  const all = await readAll();
  const cooldownDays = Number(process.env.RECENT_DONE_COOLDOWN_DAYS ?? 14);
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - cooldownMs;

  const blockers = new Map<string, { id: string; reason: "open" | "recently_done" }>();
  for (const t of all) {
    const key = normalizeDedup(t.dedup_key);
    if (t.status === "todo" || t.status === "in_progress") {
      blockers.set(key, { id: t.id, reason: "open" });
      continue;
    }
    if (t.status === "done" && t.completed_at) {
      const completedMs = Date.parse(t.completed_at);
      if (!Number.isNaN(completedMs) && completedMs >= cutoff && !blockers.has(key)) {
        blockers.set(key, { id: t.id, reason: "recently_done" });
      }
    }
  }

  const now = new Date().toISOString();
  const added: Task[] = [];
  const skipped: Array<{ dedup_key: string; existing_id: string; reason: "open" | "recently_done" }> = [];

  for (const input of inputs) {
    const key = normalizeDedup(input.dedup_key);
    const blocker = blockers.get(key);
    if (blocker) {
      skipped.push({ dedup_key: input.dedup_key, existing_id: blocker.id, reason: blocker.reason });
      continue;
    }
    const id = `task_${now.replace(/[^0-9]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
    const task: Task = {
      id,
      created_at: now,
      created_by_run: run_id,
      type: input.type,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "todo",
      dedup_key: input.dedup_key,
      target_url: input.target_url ?? null,
      completed_at: null,
      completed_by_run: null,
      commit_sha: null,
      commit_urls: null,
      notes: null,
      blocked_reason: null,
    };
    all.push(task);
    added.push(task);
    blockers.set(key, { id, reason: "open" });
  }

  await writeAll(all);
  const total_open = all.filter((t) => t.status === "todo" || t.status === "in_progress").length;
  return { added, skipped, total_open };
}

export async function markTaskInProgress(id: string): Promise<{ ok: boolean; task: Task | null }> {
  const all = await readAll();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return { ok: false, task: null };
  all[idx]!.status = "in_progress";
  await writeAll(all);
  return { ok: true, task: all[idx]! };
}

export interface MarkDoneInput {
  id: string;
  run_id: string;
  commit_sha?: string | null;
  commit_urls?: string[] | null;
  notes?: string | null;
}

export async function markTaskDone(input: MarkDoneInput): Promise<{ ok: boolean; task: Task | null }> {
  const all = await readAll();
  const idx = all.findIndex((t) => t.id === input.id);
  if (idx === -1) return { ok: false, task: null };
  const now = new Date().toISOString();
  all[idx]! = {
    ...all[idx]!,
    status: "done",
    completed_at: now,
    completed_by_run: input.run_id,
    commit_sha: input.commit_sha ?? null,
    commit_urls: input.commit_urls ?? null,
    notes: input.notes ?? null,
  };
  await writeAll(all);
  return { ok: true, task: all[idx]! };
}

export async function markTaskBlocked(
  id: string,
  reason: string,
  run_id: string
): Promise<{ ok: boolean; task: Task | null }> {
  const all = await readAll();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return { ok: false, task: null };
  all[idx]! = {
    ...all[idx]!,
    status: "blocked",
    blocked_reason: reason,
    completed_at: new Date().toISOString(),
    completed_by_run: run_id,
  };
  await writeAll(all);
  return { ok: true, task: all[idx]! };
}

export async function taskStats(): Promise<{
  total: number;
  by_status: Record<TaskStatus, number>;
  by_priority: Record<TaskPriority, number>;
}> {
  const all = await readAll();
  const by_status: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
  const by_priority: Record<TaskPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const t of all) {
    by_status[t.status]++;
    by_priority[t.priority]++;
  }
  return { total: all.length, by_status, by_priority };
}
