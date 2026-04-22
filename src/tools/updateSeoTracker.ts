import { readFile, writeFile } from "node:fs/promises";
import { SEO_TRACKER_PATH } from "../config.js";

export interface UpdateTrackerInput {
  row_match: string;
  new_status: string;
  new_end_date?: string;
  new_notes?: string;
}

export async function updateSeoTracker(
  input: UpdateTrackerInput
): Promise<{ matched: boolean; old_line: string | null; new_line: string | null }> {
  const md = await readFile(SEO_TRACKER_PATH, "utf8");
  const lines = md.split("\n");
  const needle = input.row_match.trim();

  let matchedIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("|")) continue;
    if (line.includes(needle)) {
      matchedIdx = i;
      break;
    }
  }
  if (matchedIdx === -1) {
    return { matched: false, old_line: null, new_line: null };
  }

  const oldLine = lines[matchedIdx]!;
  const cells = oldLine.split("|").map((c) => c);
  // Markdown tables start and end with "|", so cells[0] and cells[last] are empty-ish.
  // Priorité and Statut columns both use 🔴/🟡/🟢 emojis, so emoji alone can't disambiguate.
  // The Statut column is the one whose text contains one of: "À faire", "En cours", "Fait".
  // (Priorité values are "Critique", "Important", "Normal" — disjoint set.)
  const STATUS_KEYWORDS = ["À faire", "En cours", "Fait"];
  let statusIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    if (STATUS_KEYWORDS.some((k) => cells[i]!.includes(k))) {
      statusIdx = i;
      break;
    }
  }
  if (statusIdx === -1) {
    return { matched: false, old_line: oldLine, new_line: null };
  }
  cells[statusIdx] = ` ${input.new_status} `;

  // Heuristic: the last two cells before the trailing "|" are date + notes in phase 2.
  // We don't reshape the table if columns differ; we only overwrite what the caller explicitly sent.
  if (input.new_end_date && cells.length >= 3) {
    // Try to find a date cell = one that is either empty, "—", or matches DD/MM/YYYY, between status and last "Notes" cell.
    for (let i = statusIdx + 1; i < cells.length - 2; i++) {
      const trimmed = cells[i]!.trim();
      if (trimmed === "" || trimmed === "—" || /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        cells[i] = ` ${input.new_end_date} `;
        break;
      }
    }
  }
  if (input.new_notes && cells.length >= 3) {
    // Last non-empty cell before the trailing empty one is the notes cell.
    cells[cells.length - 2] = ` ${input.new_notes} `;
  }

  const newLine = cells.join("|");
  lines[matchedIdx] = newLine;
  await writeFile(SEO_TRACKER_PATH, lines.join("\n"), "utf8");
  return { matched: true, old_line: oldLine, new_line: newLine };
}
