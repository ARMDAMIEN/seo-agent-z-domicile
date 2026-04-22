import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { REPORTS_DIR } from "../config.js";

export interface SaveReportInput {
  date_iso: string;
  markdown: string;
}

export async function saveSeoReport(input: SaveReportInput): Promise<{ path: string; bytes: number }> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const path = resolve(REPORTS_DIR, `${input.date_iso}.md`);
  await writeFile(path, input.markdown, "utf8");
  return { path, bytes: Buffer.byteLength(input.markdown, "utf8") };
}
