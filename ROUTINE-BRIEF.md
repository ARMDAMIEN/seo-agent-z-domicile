# z-domicile-seo-agent — brief for building Claude Code routines

Everything you need to author one or more routines that replace the Agent SDK run.

---

## 1. What this agent actually does

It is the **autonomous SEO operator** for `https://www.z-domicile.fr`, a French **B2C
marketplace for at-home beauty & wellness professionals** (coiffeur, esthéticienne,
manucure, coach sportif, at home).

Each run it does two distinct jobs:

1. **Analyse** — pulls the last 28 days from Google Search Console, finds three kinds of
   opportunity, writes a dated markdown report, and turns each finding into a typed task
   in a persistent queue.
2. **Execute** — pops the single highest-priority task off that queue and *actually ships
   the fix*: edits the Angular frontend, commits straight to `master`, marks the task done.

The queue file is the seam between the two. That is the design's best feature and the
reason it splits cleanly into separate routines.

---

## 2. The moving parts

| Thing | Value |
|---|---|
| Site | `https://www.z-domicile.fr` |
| GSC property | `sc-domain:z-domicile.fr` (OAuth refresh-token flow — service accounts blocked by org policy) |
| Frontend repo | `ARMDAMIEN/ANGULAR-ZH`, branch **`master`** (Angular) |
| Reports repo | `ARMDAMIEN/seo-agent-z-domicile`, branch **`main`**, into `data/reports/<YYYY-MM-DD>.md` |
| Task queue | `data/tasks.json` — flat JSON array |
| Strategy context | `context/AGENT_SEO_CONTEXT.md` (165 lines) |
| Roadmap | `context/SEO_TRACKER.md` (76 lines), rows marked `🟢 À faire` / `🟡 En cours` / `✅ Fait` |
| Throughput | `MAX_TASKS_PER_RUN=1` |

> The two repos have **different default branches** (`master` vs `main`). Reusing one for
> the other makes the report mirror PUT to a nonexistent branch → 404. This already bit
> once; the config carries a comment about it.

### Current queue state

**9 open tasks, 2 done.** At one task per run, the backlog alone is 9 runs deep before
GSC adds anything new.

```
critical  meta_rewrite        Rewrite meta for /manucure-domicile-paris
high      meta_rewrite        Rewrite meta for homepage
high      content_enrichment  Enrich /maquilleuse-domicile-paris
high      content_enrichment  Enrich /coiffeur-a-domicile-bordeaux
high      content_enrichment  Enrich /coiffeur-a-domicile-lyon
high      content_enrichment  Enrich /search-pro with B2C sections
medium    meta_rewrite        Rewrite meta for /a-propos
medium    content_enrichment  Enrich /manucure-domicile-paris
medium    internal_linking    Add internal links from homepage to Paris local pages
```

---

## 3. The port is much smaller than it looks

The SDK version wires up three MCP servers: `seo_state`, `gsc`, and the official
`github` server. Under Claude Code, **only one of those needs to exist**:

| SDK tool group | Under Claude Code |
|---|---|
| `mcp__github__*` | **native** — `gh` CLI + git |
| `seo_state` (`get_seo_context`, `get_open_tasks`, `add_tasks`, `mark_task_*`, `task_stats`, `save_seo_report`, `update_seo_tracker`) | **native** — these only read/write local JSON + markdown. Read/Write/Edit do it directly. |
| `send_telegram_report` | one-line `curl` in Bash, or keep the existing module |
| `gsc` (`gsc_search_analytics`, `gsc_list_sites`, `gsc_inspect_url`) | **done** — now a remote MCP connector at `gsc-mcp-server.fly.dev/mcp`, attached via `mcp_connections` |

GSC was the only piece needing real work, and it is **already built and deployed** —
see `ARMDAMIEN/gsc-mcp-server`. A cloud routine has no secret store and only accepts
remote HTTP connectors, so the OAuth credentials live in that Fly app behind a bearer
token rather than anywhere near the routine. Everything else the routines do natively.

---

## 4. Recommended split: two routines

The existing prompt is one 6-step monolith. Split it on the queue boundary:

| | **Routine A — Analyst** | **Routine B — Operator** |
|---|---|---|
| Steps | 1–4 + report | 5–6 |
| Writes code? | **No** — read-only + local files | **Yes** — commits to `ANGULAR-ZH:master` |
| Touches | GSC, `data/reports/`, `data/tasks.json` | Frontend repo, `data/tasks.json`, `SEO_TRACKER.md` |
| Risk | very low | real — production frontend |
| Good cadence | weekly | as often as you want to burn down the backlog |

Why split:

- **Different risk profiles.** The analyst is safe to run fully unattended. The operator
  commits to a live site and deserves either supervision or tight guardrails.
- **Different useful cadences.** GSC data barely moves day to day, so analysis is weekly
  at most. But with 9 tasks queued and 1 executed per run, the operator is the bottleneck
  — run it more often and the backlog actually drains.
- **Independent failure.** Today a GSC hiccup in step 2 kills the run before any code
  ships. Split, they can't block each other.
- **The interface already exists.** `data/tasks.json` with `dedup_key` was built for this;
  `add_tasks` dedups, so re-analysis is idempotent.

Keep the Telegram report in **both**, scoped to what each one did.

> Note a discrepancy to resolve: the system prompt says *"You run once per day"*, but the
> cron was weekly (Sun 08:00 UTC). Pick one deliberately and make the prompt say it,
> because the prompt uses that framing in its `create_seo_page` pacing rule ("if no
> Phase 2 task added in the last 7 days…").

---

## 5. The rules that must survive into any routine

These are non-negotiable and come from the original system prompt. Losing them is how the
output goes bad quietly.

**Strategic framing**

1. **B2C only.** Every word targets end clients. SaaS/B2B language is forbidden —
   no "plateforme", "logiciel", "gérer vos RDV".
2. **Annuaire framing.** Position it like Pages Jaunes or WeCasa, *not* a SaaS tool.
3. **Local intent.** Local pages must feel geographically specific — arrondissements,
   quartiers.
4. **No fake data.** Never fabricate ratings, reviews or prices. Empty GSC result → say
   "no data" and move on, never invent numbers.
5. **French must actually be French.**

**Operational**

6. Read `context/AGENT_SEO_CONTEXT.md` + `context/SEO_TRACKER.md` end to end *first*.
7. Mark a task in-progress **before** any write; done/blocked **after** the attempt.
8. Never modify `SEO_TRACKER.md` rows already `✅ Fait` or `🟡 En cours` — only flip
   `🟢 À faire` rows, and only when a `create_seo_page` task succeeds.
9. **Read a similar existing file before writing new code.** Match repo conventions
   (`SeoService.setTitle` / `setDescription` vs `app.routes.ts` title — the repo uses one).
10. Conventional commits: `feat(seo): rewrite homepage meta for B2C framing`.
11. Telegram report exactly once, as the last action.

**The five task types**

| Type | Trigger | Priority rule |
|---|---|---|
| `meta_rewrite` | CTR < 2% at position ≤ 15 | critical ≤5, high ≤10, else medium |
| `content_enrichment` | position 11–20 with ≥ 10 impressions | high |
| `internal_linking` | rising query landing on a generic page | medium |
| `create_seo_page` | rising keyword matching a `🟢 À faire` row in the tracker | high if rising, else medium |
| `investigation` | anomaly you can't act on | by severity |

`dedup_key` conventions: `"meta_rewrite:" + url_path`, `"content_enrichment:" + url_path`,
`"internal_linking:" + target + ":" + from`, `"create_seo_page:" + target_url`,
`"investigation:" + slug`.

Task descriptions must be **self-contained** — inline every number and suggested value,
because the operator run executes them without re-querying GSC.

---

## 6. Routine A — Analyst (paste as the routine prompt)

```
Run the weekly Z-Domicile SEO analysis. Work in
/Users/mounir/Documents/Agentic/z-domicile-seo-agent.

You are the SEO analyst for https://www.z-domicile.fr — a French B2C marketplace for
at-home beauty & wellness professionals. This run is READ-ONLY on code: you produce a
report and enqueue tasks, you do NOT edit or commit to the frontend repo.

1. Read context/AGENT_SEO_CONTEXT.md and context/SEO_TRACKER.md end to end. Read
   data/tasks.json and note the open task count and highest-priority item.

2. Pull the last 28 days of Google Search Console data for sc-domain:z-domicile.fr via
   the GSC CLI wrapper. Produce three ranked lists, each row carrying URL-or-query,
   impressions, clicks, CTR and average position:
     a. Quick wins — pages at positions 11–20 with >= 10 impressions
     b. Meta rewrites — pages with CTR < 2% at position <= 15
     c. Rising queries — queries getting impressions with no dedicated page yet

3. Write data/reports/<today>.md: a 1–3 sentence summary, the three lists as markdown
   tables, then 3–5 concrete recommendations. Mirror it to
   ARMDAMIEN/seo-agent-z-domicile on branch `main` (NOT master — that's the frontend).

4. Append new tasks to data/tasks.json following the type, priority and dedup_key rules
   in ROUTINE-BRIEF.md §5. Dedup against existing open tasks by dedup_key — re-running
   must be idempotent. Make every description self-contained: inline all numbers and
   suggested French title/description values, because the operator run executes these
   without re-querying GSC.
   Also: if no create_seo_page task has been added in the last 7 days and the oldest
   `🟢 À faire` row in SEO_TRACKER.md has no open task, add one to keep the pipeline moving.

5. Send one Telegram summary as your last action: GSC counts, report path, tasks added
   (type/priority/title/target_url each), and the top 5 open tasks remaining.

Hard rules: B2C framing only, never SaaS/B2B language. Annuaire positioning like Pages
Jaunes, not a SaaS tool. Never fabricate GSC numbers — empty result means "no data".
All content in French. Do not touch SEO_TRACKER.md rows that are `✅ Fait` or `🟡 En cours`.
```

---

## 7. Routine B — Operator (paste as the routine prompt)

```
Execute the top Z-Domicile SEO task. Work in
/Users/mounir/Documents/Agentic/z-domicile-seo-agent.

You ship SEO fixes to https://www.z-domicile.fr, a French B2C marketplace for at-home
beauty & wellness professionals. The frontend is ARMDAMIEN/ANGULAR-ZH on branch `master`
(Angular). You commit directly to master.

1. Read context/AGENT_SEO_CONTEXT.md and context/SEO_TRACKER.md end to end.
2. Read data/tasks.json. Pick the first open task: highest priority, oldest within
   priority. Mark it in_progress BEFORE doing anything else.
3. Execute exactly ONE task, using the playbook for its type:

   meta_rewrite — find the Angular component for the target page (search the repo for the
     route or a nearby <title> / updateMeta call). Update either the SeoService call
     (setTitle / setDescription) or the app.routes.ts title, whichever convention the repo
     already uses. Keep it French. Commit: `feat(seo): rewrite meta for [url]`.

   content_enrichment — locate the page's component, add the section the task specifies
     (FAQ, neighborhoods, pricing block). Match the style of an existing local page such
     as /manucure-domicile-paris. Commit: `feat(seo): enrich [url] — [what]`.

   internal_linking — add links to the correct source page; edit the shared header/footer
     component if one exists. Commit: `feat(seo): add internal links from [src] to [dst]`.

   create_seo_page — use the local-page template in AGENT_SEO_CONTEXT.md §5. READ an
     existing local page first and match its file structure, imports, SeoService calls and
     style. Create the component, register the route, add a <url> entry to sitemap.xml.
     One commit. Then flip that row in SEO_TRACKER.md from `🟢 À faire` to `✅ Fait`.

   investigation — do NOT commit code. Mark the task blocked with a detailed write-up of
     what you checked and what a human needs to decide.

4. Mark the task done with commit_sha, commit_urls and 1–3 sentences of notes on what
   actually changed. If you hit an unrecoverable obstacle — repo structure unclear, file
   missing, requirements ambiguous — mark it blocked with a precise reason instead.
5. Send one Telegram report as your last action: the executed task with its commit and
   notes, plus the top 5 open tasks remaining.

Hard rules: exactly ONE task per run — stop even if more are queued. Always READ a similar
existing file before writing new code, and respect the repo's existing conventions. B2C
framing only, never SaaS/B2B language ("plateforme", "logiciel", "gérer vos RDV" are
forbidden). All content in French. Never fabricate ratings, reviews or prices. Never modify
SEO_TRACKER.md rows already `✅ Fait` or `🟡 En cours`.
```

---

## 8. Before the first routine run

1. ~~Port GSC~~ — **done (2026-08-19).** Deployed instead as a remote MCP connector:
   `https://gsc-mcp-server.fly.dev/mcp` (repo `ARMDAMIEN/gsc-mcp-server`). Verified live
   against the real API. Register it at claude.ai → Customize → Connectors with the bearer
   token from `gsc-mcp-server/.env`, then attach its `connector_uuid` to both routines via
   `mcp_connections`. `site_url` defaults to `sc-domain:z-domicile.fr`.
2. **Decide cadence** and make the prompt say it (the "daily" wording is stale).
3. **Check `gh auth`** covers `ARMDAMIEN/ANGULAR-ZH`, not just this repo.
4. **Pull first** — the old Fly machine pushed `chore(report):` commits to
   `origin/main` here, so a stale local checkout will hit a non-fast-forward.
5. **Consider a dry-run first pass** for Routine B. It commits to a production frontend,
   and a routine is far easier to trigger accidentally than a weekly cron was.
