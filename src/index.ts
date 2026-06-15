import "dotenv/config";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  CLAUDE_MODEL,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BASE_BRANCH,
  GSC_SITE_URL,
  MAX_TASKS_PER_RUN,
  RUN_ID,
  TODAY_ISO,
  TODAY_WEEKDAY,
} from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { getSeoContext } from "./tools/getSeoContext.js";
import { saveSeoReport } from "./tools/saveSeoReport.js";
import { updateSeoTracker } from "./tools/updateSeoTracker.js";
import { sendTelegramReport, sendFatalAlert, type TelegramReportInput } from "./tools/sendTelegramReport.js";
import {
  queryGscSearchAnalytics,
  listGscSites,
  inspectGscUrl,
  type GscSearchAnalyticsInput,
} from "./tools/gsc.js";
import {
  getOpenTasks,
  addTasks,
  markTaskInProgress,
  markTaskDone,
  markTaskBlocked,
  taskStats,
  type AddTaskInput,
} from "./tools/tasks.js";

// ─── SEO state / context tools ──────────────────────────────────────────────

const getSeoContextTool = tool(
  "get_seo_context",
  "Returns AGENT_SEO_CONTEXT.md + SEO_TRACKER.md full content, today's date, and weekday. Call this FIRST.",
  {},
  async () => {
    console.log(`  📖 get_seo_context`);
    try {
      const ctx = await getSeoContext();
      const payload = {
        ...ctx,
        today_weekday: TODAY_WEEKDAY,
        today_iso: TODAY_ISO,
        run_id: RUN_ID,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `get_seo_context failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true } }
);

const saveSeoReportTool = tool(
  "save_seo_report",
  "Write the daily GSC analysis report to data/reports/{date_iso}.md.",
  {
    date_iso: z.string(),
    markdown: z.string(),
  },
  async (args) => {
    console.log(`  📝 save_seo_report: ${args.date_iso}`);
    try {
      const res = await saveSeoReport(args);
      console.log(`    → ${res.bytes}B, committed=${res.committed}${res.commit_error ? ` (${res.commit_error})` : ""}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `save_seo_report failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false } }
);

const updateSeoTrackerTool = tool(
  "update_seo_tracker",
  "Patch a row in context/SEO_TRACKER.md. Identifies the row by row_match (a unique substring), replaces the status cell, optionally updates end-date and notes.",
  {
    row_match: z.string(),
    new_status: z.string(),
    new_end_date: z.string().optional(),
    new_notes: z.string().optional(),
  },
  async (args) => {
    console.log(`  ✏️ update_seo_tracker: "${args.row_match}" → ${args.new_status}`);
    try {
      const res = await updateSeoTracker(args);
      if (!res.matched) {
        return { content: [{ type: "text" as const, text: `no row matched "${args.row_match}"` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `update_seo_tracker failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: true } }
);

// ─── Task queue tools ───────────────────────────────────────────────────────

const getOpenTasksTool = tool(
  "get_open_tasks",
  "Returns open tasks (status=todo|in_progress) sorted by priority then creation time. The first entry is the highest-priority task to execute this run.",
  { limit: z.number().int().positive().max(200).optional() },
  async (args) => {
    try {
      const res = await getOpenTasks(args.limit);
      console.log(`  📋 get_open_tasks: ${res.total_open} open / ${res.total_all} total`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `get_open_tasks failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true } }
);

const addTasksTool = tool(
  "add_tasks",
  `Add one or more new tasks to the queue. Dedup is enforced: if a task with the same dedup_key already exists in status todo or in_progress, it is skipped (returned under 'skipped').

Task types:
- meta_rewrite: rewrite <title> and <meta description> for a page. target_url required.
- content_enrichment: add FAQ / neighborhoods / pricing / internal sections to an existing page. target_url required.
- internal_linking: add links from one page to another (homepage, footer, related). target_url is the page RECEIVING the new links.
- create_seo_page: create a new local /métier-a-domicile-ville page from the Phase 2 roadmap in SEO_TRACKER.md. target_url is the new URL to create.
- investigation: surface a finding for human review (agent cannot act autonomously).

dedup_key convention: "{type}:{target_url-or-slug}" — e.g. "meta_rewrite:/" or "create_seo_page:/coach-sportif-a-domicile-paris". Stable across runs.`,
  {
    tasks: z
      .array(
        z.object({
          type: z.enum([
            "meta_rewrite",
            "content_enrichment",
            "internal_linking",
            "create_seo_page",
            "investigation",
          ]),
          title: z.string(),
          description: z.string().describe("Full context needed to execute later. Include current values, suggested values, GSC metrics."),
          priority: z.enum(["critical", "high", "medium", "low"]),
          dedup_key: z.string(),
          target_url: z.string().optional().nullable(),
        })
      )
      .min(1),
  },
  async (args) => {
    try {
      const res = await addTasks(args.tasks as AddTaskInput[], RUN_ID);
      console.log(`  ➕ add_tasks: ${res.added.length} added, ${res.skipped.length} skipped (open=${res.total_open})`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `add_tasks failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false } }
);

const markTaskInProgressTool = tool(
  "mark_task_in_progress",
  "Mark a task as in_progress before you begin executing it. Call this BEFORE making any GitHub edits.",
  { id: z.string() },
  async (args) => {
    try {
      const res = await markTaskInProgress(args.id);
      if (!res.ok) return { content: [{ type: "text" as const, text: `task ${args.id} not found` }], isError: true };
      console.log(`  🏃 mark_task_in_progress: ${args.id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `mark_task_in_progress failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false } }
);

const markTaskDoneTool = tool(
  "mark_task_done",
  "Mark a task as done AFTER the work (commit, file edit, etc.) has succeeded. Include commit_sha / commit_urls if a GitHub commit was made.",
  {
    id: z.string(),
    commit_sha: z.string().optional().nullable(),
    commit_urls: z.array(z.string()).optional().nullable(),
    notes: z.string().optional().nullable().describe("1-3 sentences on what was actually done."),
  },
  async (args) => {
    try {
      const res = await markTaskDone({
        id: args.id,
        run_id: RUN_ID,
        commit_sha: args.commit_sha ?? null,
        commit_urls: args.commit_urls ?? null,
        notes: args.notes ?? null,
      });
      if (!res.ok) return { content: [{ type: "text" as const, text: `task ${args.id} not found` }], isError: true };
      console.log(`  ✅ mark_task_done: ${args.id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `mark_task_done failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false } }
);

const markTaskBlockedTool = tool(
  "mark_task_blocked",
  "Mark a task as blocked when you cannot execute it autonomously (missing context, ambiguous requirements, needs human review). Include a clear reason.",
  {
    id: z.string(),
    reason: z.string(),
  },
  async (args) => {
    try {
      const res = await markTaskBlocked(args.id, args.reason, RUN_ID);
      if (!res.ok) return { content: [{ type: "text" as const, text: `task ${args.id} not found` }], isError: true };
      console.log(`  ⛔ mark_task_blocked: ${args.id} (${args.reason.slice(0, 60)})`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `mark_task_blocked failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false } }
);

const taskStatsTool = tool(
  "task_stats",
  "Return aggregate counts of the task queue by status and priority. Useful for the final Telegram report.",
  {},
  async () => {
    try {
      const res = await taskStats();
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `task_stats failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true } }
);

// ─── GSC tools ──────────────────────────────────────────────────────────────

const gscSearchAnalyticsTool = tool(
  "gsc_search_analytics",
  "Query Google Search Console Search Analytics. Returns clicks/impressions/ctr/position grouped by the requested dimensions.",
  {
    start_date: z.string(),
    end_date: z.string(),
    dimensions: z
      .array(z.enum(["query", "page", "country", "device", "searchAppearance", "date"]))
      .min(1),
    row_limit: z.number().int().positive().max(25000).optional(),
    start_row: z.number().int().nonnegative().optional(),
    filters: z
      .array(
        z.object({
          dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
          operator: z.enum(["contains", "notContains", "equals", "notEquals", "includingRegex", "excludingRegex"]),
          expression: z.string(),
        })
      )
      .optional(),
    data_state: z.enum(["final", "all"]).optional(),
  },
  async (args) => {
    console.log(
      `  📈 gsc_search_analytics: ${args.start_date}→${args.end_date} dims=${args.dimensions.join(",")}`
    );
    try {
      const res = await queryGscSearchAnalytics(args as GscSearchAnalyticsInput);
      console.log(`    → ${res.rows.length} rows`);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `gsc_search_analytics failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const gscListSitesTool = tool(
  "gsc_list_sites",
  "List GSC sites accessible to the authenticated user.",
  {},
  async () => {
    try {
      const res = await listGscSites();
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `gsc_list_sites failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const gscInspectUrlTool = tool(
  "gsc_inspect_url",
  "Inspect indexing status of a single URL. Returns coverage_state, last_crawl_time, indexing_state, verdict.",
  { inspection_url: z.string().url() },
  async (args) => {
    try {
      const res = await inspectGscUrl(args.inspection_url);
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `gsc_inspect_url failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

// ─── Telegram ───────────────────────────────────────────────────────────────

const taskSummarySchema = z.object({
  type: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  title: z.string(),
  target_url: z.string().optional().nullable(),
});

const sendTelegramReportTool = tool(
  "send_telegram_report",
  "Send the final run summary to Telegram. Call this as the VERY LAST step. Include the list of tasks added this run and a preview of the next-up queue so the user sees concrete actions, not just stats.",
  {
    date_iso: z.string(),
    gsc_findings: z.object({
      positions_11_20: z.number().int().nonnegative(),
      low_ctr: z.number().int().nonnegative(),
      rising_queries: z.number().int().nonnegative(),
    }),
    report_path: z.string(),
    task_stats: z.object({
      open_before: z.number().int().nonnegative(),
      added_this_run: z.number().int().nonnegative(),
      done_this_run: z.number().int().nonnegative(),
      blocked_this_run: z.number().int().nonnegative(),
      open_after: z.number().int().nonnegative(),
    }),
    added_tasks: z
      .array(taskSummarySchema)
      .optional()
      .describe("All tasks created this run (short list). Typically 3-10 items."),
    executed_task: z
      .object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        status: z.enum(["done", "blocked"]),
        commit_sha: z.string().optional().nullable(),
        commit_urls: z.array(z.string()).optional().nullable(),
        notes: z.string().optional().nullable().describe("1-3 sentences on what actually changed (for 'done') — shown in the Telegram message."),
        blocked_reason: z.string().optional().nullable(),
      })
      .nullable(),
    next_up: z
      .array(taskSummarySchema)
      .optional()
      .describe("Top 5 highest-priority remaining open tasks, shown as a preview of what tomorrow's run will target."),
    notes: z.string().optional(),
  },
  async (args) => {
    console.log(`  📡 send_telegram_report`);
    try {
      const res = await sendTelegramReport(args as TelegramReportInput);
      if (!res.ok) {
        return { content: [{ type: "text" as const, text: `Telegram failed: ${res.error}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Telegram sent (message_id=${res.message_id})` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Telegram error: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false, openWorldHint: true } }
);

// ─── MCP servers ────────────────────────────────────────────────────────────

const seoStateServer = createSdkMcpServer({
  name: "seo_state",
  version: "2.0.0",
  tools: [
    getSeoContextTool,
    saveSeoReportTool,
    updateSeoTrackerTool,
    getOpenTasksTool,
    addTasksTool,
    markTaskInProgressTool,
    markTaskDoneTool,
    markTaskBlockedTool,
    taskStatsTool,
    sendTelegramReportTool,
  ],
});

const gscServer = createSdkMcpServer({
  name: "gsc",
  version: "1.0.0",
  tools: [gscSearchAnalyticsTool, gscListSitesTool, gscInspectUrlTool],
});

const externalMcpServers: Record<string, any> = {
  github: {
    type: "stdio",
    // Baked into the image via package.json (not fetched at runtime) so the
    // server registers deterministically — no npx cold-fetch race that
    // silently drops mcp__github__* tools. See node_modules/.../dist/index.js.
    command: "node",
    args: ["node_modules/@modelcontextprotocol/server-github/dist/index.js"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: GITHUB_TOKEN },
  },
};

// ─── Task prompt ────────────────────────────────────────────────────────────

const taskPrompt = `Run the daily Z-Domicile SEO workflow now.

Today: ${TODAY_ISO} (${TODAY_WEEKDAY})
Run ID: ${RUN_ID}
Max tasks to execute this run: ${MAX_TASKS_PER_RUN}
GSC property: ${GSC_SITE_URL}
Frontend repo: ${GITHUB_OWNER}/${GITHUB_REPO} (branch: ${GITHUB_BASE_BRANCH})

Follow the workflow in your system prompt exactly. Begin by calling get_seo_context, then get_open_tasks.`;

console.log(`\n🚀 seo-agent | ${TODAY_ISO} (${TODAY_WEEKDAY}) | max_tasks=${MAX_TASKS_PER_RUN}\n`);

async function main() {
  for await (const message of query({
    prompt: taskPrompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: CLAUDE_MODEL,
      mcpServers: {
        ...externalMcpServers,
        gsc: gscServer,
        seo_state: seoStateServer,
      },
      tools: [],
      allowedTools: ["mcp__gsc__*", "mcp__github__*", "mcp__seo_state__*"],
      permissionMode: "bypassPermissions",
      maxTurns: 200,
      sandbox: { enabled: false, failIfUnavailable: false },
      stderr: (data: string) => process.stderr.write(`[cli-stderr] ${data}`),
    } as any,
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          console.log(`\n🤖 ${block.text.slice(0, 300)}`);
        }
        if (block.type === "tool_use") {
          console.log(`\n🔧 ${block.name}`);
        }
      }
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`\n✅ Done. Cost: $${message.total_cost_usd?.toFixed(4) ?? "?"}`);
      } else {
        // SDK surfaced a non-success result. Treat as fatal so the catch below
        // can classify + Telegram-alert in one place.
        const errs = (message as any).errors ?? (message as any).error ?? "agent returned non-success result";
        throw new Error(typeof errs === "string" ? errs : JSON.stringify(errs));
      }
    }
  }
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  try {
    const res = await sendFatalAlert(err, {
      agent: "seo-agent",
      date_iso: TODAY_ISO,
      run_id: RUN_ID,
    });
    if (!res.ok) console.error("Telegram alert failed:", res.error);
  } catch (alertErr) {
    console.error("Telegram alert threw:", alertErr);
  }
  process.exit(1);
});
