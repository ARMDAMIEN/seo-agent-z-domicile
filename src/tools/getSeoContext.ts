import { readFile } from "node:fs/promises";
import { AGENT_SEO_CONTEXT_PATH, SEO_TRACKER_PATH } from "../config.js";

export interface SeoContextPayload {
  agent_context_md: string;
  seo_tracker_md: string;
  today_iso: string;
  today_weekday: string;
  is_page_creation_day: boolean;
}

export async function getSeoContext(): Promise<SeoContextPayload> {
  const [agent_context_md, seo_tracker_md] = await Promise.all([
    readFile(AGENT_SEO_CONTEXT_PATH, "utf8"),
    readFile(SEO_TRACKER_PATH, "utf8"),
  ]);
  const now = new Date();
  const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    now.getDay()
  ]!;
  return {
    agent_context_md,
    seo_tracker_md,
    today_iso: now.toISOString().slice(0, 10),
    today_weekday: weekday,
    is_page_creation_day: false, // filled in at call site from config
  };
}
