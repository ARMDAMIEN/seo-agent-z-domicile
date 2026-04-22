# seo-agent

Weekly Z-Domicile SEO agent. Pulls Google Search Console data, writes a dated analysis report, and commits SEO changes (meta rewrites, content enrichments, new local pages) directly to the frontend repo's `main` branch.

Built on [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

**Deployment:** the agent code + persistent state live on a Fly.io app (`z-domicile-seo-agent`) with a mounted volume. A weekly **GitHub Actions** cron triggers a one-shot Fly machine (`flyctl machine run --rm`) — Fly is the runtime, GH Actions is the scheduler.

## What it does

Every run:

1. Loads context from [context/AGENT_SEO_CONTEXT.md](context/AGENT_SEO_CONTEXT.md) + [context/SEO_TRACKER.md](context/SEO_TRACKER.md) and the current task queue (`/app/data/tasks.json` on the Fly volume).
2. Pulls last-28-day GSC data for `z-domicile.fr` via the SDK-native GSC tools.
3. Writes `data/reports/YYYY-MM-DD.md` to the volume.
4. **Generates new tasks** from today's findings. Dedup by `dedup_key` means re-running doesn't flood the queue.
5. **Executes the highest-priority open tasks** (default 3 per run, configurable via `MAX_TASKS_PER_RUN`). Commits directly to the frontend repo, flips the tracker when relevant, marks each task `done` (or `blocked` if it can't).
6. Sends a Telegram summary with task stats + what was executed.

The task queue is the agent's persistent work memory: analysis fills it, execution drains it. State lives on the Fly volume so it survives across weekly runs.

## Setup

### 1. Install (local dev)

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

Set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` in `.env` (local) or as Fly secrets (production).

### 4. Telegram (optional but recommended)

Create a bot via [@BotFather](https://t.me/BotFather), grab the token, start a chat with it, and get your chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`. Put both in `.env` / Fly secrets.

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

## Deploy: Fly.io app

One-time setup of the Fly app + volume + secrets:

```bash
fly launch --no-deploy
fly volumes create seo_data --size 1 --region cdg

fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  CLAUDE_MODEL=claude-opus-4-7 \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GSC_REFRESH_TOKEN=... \
  GSC_SITE_URL=https://www.z-domicile.fr/ \
  GITHUB_TOKEN=ghp_... \
  GITHUB_OWNER=ARMDAMIEN \
  GITHUB_REPO=ANGULAR-ZH \
  GITHUB_BASE_BRANCH=master \
  MAX_TASKS_PER_RUN=3 \
  TELEGRAM_BOT_API_KEY=... \
  TELEGRAM_CHAT_ID=...

# Build & push the initial image (CI will keep it fresh after this).
fly deploy --build-only --push --remote-only
```

### (Optional) Seed the volume with existing task queue

The Fly volume starts empty. If you have a local `data/tasks.json` you want to bootstrap with (e.g. tasks already discovered locally), copy it into the volume **after a first deploy**:

```bash
# Run any one-shot machine just to materialise the volume mount.
flyctl machine run registry.fly.io/z-domicile-seo-agent:latest \
  --app z-domicile-seo-agent --region cdg \
  --volume seo_data:/app/data --rm

# Then SFTP the seed file in.
fly ssh sftp shell --app z-domicile-seo-agent
sftp> put data/tasks.json /app/data/tasks.json
sftp> quit
```

Otherwise the agent rebuilds the queue from GSC on its first run.

After this, the GitHub Actions workflow handles both rebuilds (on `main` push) and weekly runs (Monday 08:00 UTC).

## Schedule: GitHub Actions

The workflow lives at [.github/workflows/seo-agent.yml](.github/workflows/seo-agent.yml). Two jobs:

- **`deploy`** — runs on push to `main` touching `src/`, `context/`, `Dockerfile`, `fly.toml`, etc. Rebuilds + pushes the image to Fly's registry.
- **`run`** — runs on the weekly cron (`0 8 * * 1` = Monday 08:00 UTC). Spawns a one-shot Fly machine via `flyctl machine run --rm` that mounts the `seo_data` volume, runs the agent, and is auto-removed on exit.

`workflow_dispatch` exposes a `mode` input (`run` / `deploy` / `deploy-run`) for manual triggers.

### Repository secrets

Set under **Settings → Secrets and variables → Actions → Secrets**:

| Secret | What |
|---|---|
| `FLY_API_TOKEN` | from `fly tokens create deploy` (scoped to the app) |

That's it for the workflow — all other secrets (Anthropic, Google, GitHub PAT, Telegram) are stored as **Fly secrets** and injected into the machine at runtime by Fly.

## Environment variables

See [.env.example](.env.example). Required: `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`, `GSC_SITE_URL`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`. Optional: `CLAUDE_MODEL` (default `claude-opus-4-7`), `GITHUB_BASE_BRANCH` (default `main`), `MAX_TASKS_PER_RUN` (default `1` locally, `3` in prod), `TELEGRAM_*`.

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
- **One-shot Fly machines.** `--rm` on `flyctl machine run` cleans the machine after exit; the volume persists independently.
