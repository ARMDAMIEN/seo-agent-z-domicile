import { TELEGRAM_BOT_API_KEY, TELEGRAM_CHAT_ID } from "../config.js";

export interface TelegramTaskSummary {
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  target_url?: string | null;
}

export interface TelegramReportInput {
  date_iso: string;
  gsc_findings: {
    positions_11_20: number;
    low_ctr: number;
    rising_queries: number;
  };
  report_path: string;
  task_stats: {
    open_before: number;
    added_this_run: number;
    done_this_run: number;
    blocked_this_run: number;
    open_after: number;
  };
  added_tasks?: TelegramTaskSummary[];
  executed_task: {
    id: string;
    type: string;
    title: string;
    status: "done" | "blocked";
    commit_sha?: string | null;
    commit_urls?: string[] | null;
    notes?: string | null;
    blocked_reason?: string | null;
  } | null;
  next_up?: TelegramTaskSummary[];
  notes?: string;
}

function escapeMarkdownV2(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

const PRIORITY_ICON: Record<TelegramTaskSummary["priority"], string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function formatReport(input: TelegramReportInput): string {
  const e = escapeMarkdownV2;
  const lines: string[] = [];
  lines.push(`*z\\-domicile seo\\-agent* — ${e(input.date_iso)}`);
  lines.push("");
  lines.push(
    `📊 GSC  pos 11\\-20: *${input.gsc_findings.positions_11_20}*  \\|  low CTR: *${input.gsc_findings.low_ctr}*  \\|  rising: *${input.gsc_findings.rising_queries}*`
  );
  lines.push(
    `📋 tasks  \\+${input.task_stats.added_this_run}  ✅${input.task_stats.done_this_run}  ⛔${input.task_stats.blocked_this_run}  \\|  open: ${input.task_stats.open_before} → *${input.task_stats.open_after}*`
  );
  lines.push(`📝 report: \`${e(input.report_path)}\``);

  // Executed task — detailed block
  if (input.executed_task) {
    const t = input.executed_task;
    const icon = t.status === "done" ? "✅" : "⛔";
    lines.push("");
    lines.push(`${icon} *executed:* \`${e(t.type)}\` — ${e(truncate(t.title, 80))}`);
    if (t.commit_sha) {
      lines.push(`    📌 \`${e(t.commit_sha.slice(0, 10))}\``);
    }
    if (t.commit_urls?.length) {
      for (const u of t.commit_urls.slice(0, 3)) {
        lines.push(`    🔗 ${e(u)}`);
      }
    }
    if (t.notes) {
      lines.push(`    📝 _${e(truncate(t.notes, 240))}_`);
    }
    if (t.blocked_reason) {
      lines.push(`    ⛔ _${e(truncate(t.blocked_reason, 240))}_`);
    }
  } else {
    lines.push("");
    lines.push(`_no task executed this run_`);
  }

  // Added tasks — short list
  if (input.added_tasks?.length) {
    lines.push("");
    lines.push(`*➕ added this run:*`);
    for (const t of input.added_tasks) {
      const icon = PRIORITY_ICON[t.priority] ?? "⚪";
      const url = t.target_url ? ` \\(\`${e(t.target_url)}\`\\)` : "";
      lines.push(`${icon} \`${e(t.type)}\` — ${e(truncate(t.title, 70))}${url}`);
    }
  }

  // Next-up queue preview
  if (input.next_up?.length) {
    lines.push("");
    lines.push(`*🔜 next up:*`);
    for (const t of input.next_up.slice(0, 5)) {
      const icon = PRIORITY_ICON[t.priority] ?? "⚪";
      lines.push(`${icon} \`${e(t.type)}\` — ${e(truncate(t.title, 70))}`);
    }
  }

  if (input.notes) {
    lines.push("");
    lines.push(`_${e(input.notes)}_`);
  }
  return lines.join("\n");
}

export async function sendTelegramReport(
  input: TelegramReportInput
): Promise<{ ok: boolean; message_id: number | null; error?: string }> {
  if (!TELEGRAM_BOT_API_KEY || !TELEGRAM_CHAT_ID) {
    return {
      ok: false,
      message_id: null,
      error: "TELEGRAM_BOT_API_KEY or TELEGRAM_CHAT_ID not set",
    };
  }
  const text = formatReport(input);
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_API_KEY}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      message_id: null,
      error: `Telegram API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
    };
  }
  return { ok: true, message_id: data.result?.message_id ?? null };
}
