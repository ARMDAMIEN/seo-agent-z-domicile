import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Anthropic
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-7";

// Google Search Console (OAuth2 refresh-token flow — service-account keys blocked by org policy)
export const GSC_SITE_URL = process.env.GSC_SITE_URL ?? "https://www.z-domicile.fr/";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
export const GSC_REFRESH_TOKEN = process.env.GSC_REFRESH_TOKEN ?? "";

// GitHub (direct-commit to main)
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
export const GITHUB_OWNER = process.env.GITHUB_OWNER ?? "";
export const GITHUB_REPO = process.env.GITHUB_REPO ?? "";
export const GITHUB_BASE_BRANCH = process.env.GITHUB_BASE_BRANCH ?? "main";

// Where the daily report is mirrored so it's accessible via `git pull` (the
// `data/` dir is gitignored locally, but API-pushed files still land in the
// remote repo). Defaults to this agent's own repo.
export const REPORTS_GITHUB_OWNER = process.env.REPORTS_GITHUB_OWNER ?? "ARMDAMIEN";
export const REPORTS_GITHUB_REPO = process.env.REPORTS_GITHUB_REPO ?? "seo-agent-z-domicile";

// Agent tuning
export const MAX_TASKS_PER_RUN = Number(process.env.MAX_TASKS_PER_RUN ?? 1);

// Telegram
export const TELEGRAM_BOT_API_KEY = process.env.TELEGRAM_BOT_API_KEY ?? "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// Paths
const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "..");
export const CONTEXT_DIR = resolve(PROJECT_ROOT, "context");
export const DATA_DIR = resolve(PROJECT_ROOT, "data");
export const REPORTS_DIR = resolve(DATA_DIR, "reports");
export const AGENT_SEO_CONTEXT_PATH = resolve(CONTEXT_DIR, "AGENT_SEO_CONTEXT.md");
export const SEO_TRACKER_PATH = resolve(CONTEXT_DIR, "SEO_TRACKER.md");

// Derived
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const TODAY_WEEKDAY = DAYS[new Date().getDay()]!;
export const TODAY_ISO = new Date().toISOString().slice(0, 10);
export const RUN_ID = TODAY_ISO;
