import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import type { StatusNote, OrchestratorConfig } from "./types";

const NOTES_FILE = "status-notes.json";

interface StatusNotesStore {
  notes: StatusNote[];
}

export function loadStatusNotes(outputDir: string): StatusNotesStore {
  const filePath = join(outputDir, NOTES_FILE);
  if (!existsSync(filePath)) {
    return { notes: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return { notes: Array.isArray(raw.notes) ? raw.notes : [] };
  } catch {
    return { notes: [] };
  }
}

export async function saveStatusNotes(outputDir: string, store: StatusNotesStore): Promise<void> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const filePath = join(outputDir, NOTES_FILE);
  await Bun.write(filePath, JSON.stringify(store, null, 2));
}

export async function addStatusNote(outputDir: string, project: string, message: string): Promise<StatusNote> {
  const store = loadStatusNotes(outputDir);
  const note: StatusNote = {
    project,
    message,
    timestamp: new Date().toISOString(),
  };
  store.notes.push(note);
  await saveStatusNotes(outputDir, store);
  return note;
}

export function getNotesForProject(notes: StatusNote[], projectName: string): StatusNote[] {
  return notes.filter((n) => n.project.toLowerCase() === projectName.toLowerCase());
}

export function getRecentNotes(notes: StatusNote[], since?: Date): StatusNote[] {
  const cutoff = since ?? new Date(Date.now() - 48 * 60 * 60 * 1000);
  return notes.filter((n) => new Date(n.timestamp) >= cutoff);
}

export async function clearNotesForProject(outputDir: string, projectName: string): Promise<number> {
  const store = loadStatusNotes(outputDir);
  const before = store.notes.length;
  store.notes = store.notes.filter((n) => n.project.toLowerCase() !== projectName.toLowerCase());
  const removed = before - store.notes.length;
  await saveStatusNotes(outputDir, store);
  return removed;
}

export function resolveProjectName(input: string, config: OrchestratorConfig): string | null {
  const lower = input.toLowerCase();

  // Exact match first
  const exact = config.projects.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact.name;

  // Partial match (starts with or contains)
  const matches = config.projects.filter(
    (p) => p.name.toLowerCase().startsWith(lower) || p.name.toLowerCase().includes(lower)
  );

  if (matches.length === 1) return matches[0].name;

  // Fuzzy match: allow small typos (Levenshtein distance <= 2)
  const fuzzy = config.projects.filter(
    (p) => levenshtein(p.name.toLowerCase(), lower) <= 2
  );
  if (fuzzy.length === 1) return fuzzy[0].name;

  return null; // ambiguous or no match
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return Math.abs(m - n); // early exit
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}
