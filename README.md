# seo-agent

Weekly Z-Domicile SEO agent. Pulls Google Search Console data, writes a dated analysis report, and commits SEO changes (meta rewrites, content enrichments, new local pages) directly to the frontend repo's `main` branch.

Built on [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

## What it does

Every run (once a week via GitHub Actions):

1. Loads context from [context/AGENT_SEO_CONTEXT.md](context/AGENT_SEO_CONTEXT.md) + [context/SEO_TRACKER.md](context/SEO_TRACKER.md) and the current task queue (`data/tasks.json`).
2. Pulls last-28-day GSC data for `z-domicile.fr` via the SDK-native GSC tools.
3. Writes `data/reports/YYYY-MM-DD.md` with three ranked lists (quick-win pages, low-CTR pages, rising untargeted queries).
4. **Generates new tasks** from today's findings (meta rewrites, content enrichments, internal linking, new page creations from Phase 2 roadmap, investigations). Dedup by `dedup_key` means re-running the same analysis doesn't flood the queue.
5. **Executes the highest-priority open tasks** (default 3 per run, configurable via `MAX_TASKS_PER_RUN`). Commits directly to the frontend repo, flips the tracker when relevant, marks each task `done` (or `blocked` if it can't).
6. Sends a Telegram summary with task stats + what was executed.
7. The workflow then commits the updated `data/` (tasks queue + report) back to this repo so state persists across weekly runs.

The task queue is the agent's persistent work memory: analysis fills it, execution drains it.

## Setup

### 1. Install

```bash
cd seo-agent
npm install
cp .env.example .env
# fill in the .env values
```

### 2. GSC OAuth2 refresh token

GSC auth uses an OAuth2 refresh token (not a service-account key — GCP org policy `iam.disableServiceAccountKeyCreation` blocks those).

1. In GCP console → APIs & Services → Credentials, create an OAuth 2.0 Client of type **Desktop**. Copy the client ID + secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
2. Make sure the Google account you'll sign in with has access to the `https://www.z-domicile.fr/` property in Search Console.
3. Run:
   ```bash
   npm run gsc:token
   ```
   Open the printed URL, approve, paste the `code=...` value back in. It prints a `GSC_REFRESH_TOKEN=...` line — paste it into `.env`.

### 3. GitHub PAT (frontend repo)

Generate a fine-grained personal access token scoped to the **frontend repo only**, with:
- Repository access: only `<owner>/<repo>` (the Z-Domicile Angular frontend).
- Permissions: **Contents: Read and write**, **Metadata: Read**.

Set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` in `.env` (local) or as secrets (GitHub Actions, see below).

### 4. Telegram (optional but recommended)

Create a bot via [@BotFather](https://t.me/BotFather), grab the token, start a chat with it, and get your chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`. Put both in `.env`.

## Run locally

```bash
# Normal run: analysis + task generation + execute N tasks + Telegram.
npm start

# Execute a different number of tasks:
MAX_TASKS_PER_RUN=5 npm start
```

After a run, verify:
- `data/reports/YYYY-MM-DD.md` exists.
- `data/tasks.json` has new entries (if GSC surfaced findings) and the executed ones are `done` / `blocked`.
- Telegram message arrived with task stats + executed-task lines.
- If the executed task was `create_seo_page` or a code edit: a new commit on the frontend repo.

## Deploy: GitHub Actions (weekly)

The workflow lives at [.github/workflows/seo-agent.yml](.github/workflows/seo-agent.yml). It runs every **Monday 08:00 UTC** and can also be triggered manually from the Actions tab.

### Repository secrets

Set these under **Settings → Secrets and variables → Actions → Secrets**:

| Secret | What |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `GOOGLE_CLIENT_ID` | OAuth Desktop client id |
| `GOOGLE_CLIENT_SECRET` | OAuth Desktop client secret |
| `GSC_REFRESH_TOKEN` | from `npm run gsc:token` |
| `FRONTEND_GITHUB_TOKEN` | fine-grained PAT scoped to the **frontend** repo (mapped into the agent as `GITHUB_TOKEN`) |
| `TELEGRAM_BOT_API_KEY` | optional |
| `TELEGRAM_CHAT_ID` | optional |

### Repository variables

Under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Default | Notes |
|---|---|---|
| `GSC_SITE_URL` | `https://www.z-domicile.fr/` | |
| `FRONTEND_GITHUB_OWNER` | — | e.g. `ARMDAMIEN` |
| `FRONTEND_GITHUB_REPO` | — | e.g. `ANGULAR-ZH` |
| `FRONTEND_GITHUB_BASE_BRANCH` | `master` | branch on the frontend repo to commit to |
| `MAX_TASKS_PER_RUN` | `3` | tasks executed per weekly run |
| `CLAUDE_MODEL` | `claude-opus-4-7` | |

### State persistence

The workflow checks out this repo, runs the agent, then commits `data/tasks.json` + `data/reports/` back. That's how the task queue (the agent's memory) survives across runs. The commit-back is skipped when nothing changed.

The frontend PAT is **distinct** from the Actions-built-in `GITHUB_TOKEN`: the built-in token is used to commit state back to *this* repo; `FRONTEND_GITHUB_TOKEN` is what the agent uses to commit SEO changes to the *frontend* repo.

## Environment variables

See [.env.example](.env.example). Required: `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`, `GSC_SITE_URL`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`. Optional: `CLAUDE_MODEL` (default `claude-opus-4-7`), `GITHUB_BASE_BRANCH` (default `main`), `MAX_TASKS_PER_RUN` (default `1` locally, `3` in CI), `TELEGRAM_*`.

## Tools available to the agent

External MCP server (stdio, launched by the SDK at startup):
- `mcp__github__*` — GitHub repo read/write (via `@modelcontextprotocol/server-github`).

SDK-native tools bundled as `mcp__gsc__*` ([src/tools/gsc.ts](src/tools/gsc.ts), using `googleapis` + OAuth2 refresh token):
- `gsc_search_analytics` — the main workhorse; parameterized query-by-dimensions over clicks/impressions/ctr/position.
- `gsc_list_sites` — connectivity sanity check.
- `gsc_inspect_url` — single-URL index status.

SDK-native tools bundled as `mcp__seo_state__*` ([src/tools/](src/tools/)):
- `get_seo_context` — reads both context markdown files.
- `save_seo_report` — writes the dated report.
- `get_open_tasks` / `add_tasks` / `mark_task_in_progress` / `mark_task_done` / `mark_task_blocked` / `task_stats` — the persistent task queue stored in `data/tasks.json`.
- `update_seo_tracker` — patches a row in `SEO_TRACKER.md`.
- `send_telegram_report` — end-of-run summary.

## Notes

- **Direct commit to the frontend `main`** — no PR gate. The frontend repo's CI/CD deploys the change. Limit the GitHub PAT to that repo only.
- **Weekly cadence.** SEO signals don't move daily; running once a week saves tokens and avoids analysis churn. Bump `MAX_TASKS_PER_RUN` to drain the backlog faster.
- **Idempotent analysis.** Task dedup by `dedup_key` means re-running doesn't create duplicate work items.
