import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  REPORTS_DIR,
  GITHUB_TOKEN,
  GITHUB_BASE_BRANCH,
  REPORTS_GITHUB_OWNER,
  REPORTS_GITHUB_REPO,
} from "../config.js";

export interface SaveReportInput {
  date_iso: string;
  markdown: string;
}

export interface SaveReportResult {
  path: string;
  bytes: number;
  committed: boolean;
  commit_error?: string;
}

export async function saveSeoReport(input: SaveReportInput): Promise<SaveReportResult> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const path = resolve(REPORTS_DIR, `${input.date_iso}.md`);
  await writeFile(path, input.markdown, "utf8");
  const bytes = Buffer.byteLength(input.markdown, "utf8");

  // Best-effort mirror to GitHub so reports survive the ephemeral volume and
  // are reachable via `git pull`. Local write is the source of truth — a
  // commit failure must not break the agentic run.
  let committed = false;
  let commit_error: string | undefined;
  try {
    await mirrorReportToGitHub(input.date_iso, input.markdown);
    committed = true;
  } catch (err) {
    commit_error = err instanceof Error ? err.message : String(err);
    console.error(`  ⚠️  save_seo_report: GitHub mirror failed (local write OK): ${commit_error}`);
  }

  return { path, bytes, committed, commit_error };
}

async function mirrorReportToGitHub(date_iso: string, markdown: string): Promise<void> {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not set");
  const repoPath = `data/reports/${date_iso}.md`;
  const apiBase = `https://api.github.com/repos/${REPORTS_GITHUB_OWNER}/${REPORTS_GITHUB_REPO}/contents/${repoPath}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "z-domicile-seo-agent",
  };

  // GitHub's PUT contents API needs the current blob `sha` to update an existing file.
  let sha: string | undefined;
  const head = await fetch(`${apiBase}?ref=${GITHUB_BASE_BRANCH}`, { headers });
  if (head.ok) {
    const json = (await head.json()) as { sha?: string };
    sha = json.sha;
  } else if (head.status !== 404) {
    throw new Error(`GET → ${head.status} ${await head.text()}`);
  }

  const put = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore(report): ${date_iso}`,
      content: Buffer.from(markdown, "utf8").toString("base64"),
      branch: GITHUB_BASE_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!put.ok) throw new Error(`PUT → ${put.status} ${await put.text()}`);
}
