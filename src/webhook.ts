import type { OrchestratorConfig } from "./types";
import {
  addStatusNote,
  loadStatusNotes,
  getRecentNotes,
  clearNotesForProject,
  resolveProjectName,
} from "./status-notes";

interface TelegramMessage {
  chatId: number;
  text: string;
  messageId: number;
}

export function parseTelegramUpdate(body: unknown): TelegramMessage | null {
  const update = body as any;
  const msg = update?.message;
  if (!msg?.text || !msg?.chat?.id || !msg?.message_id) return null;
  return {
    chatId: msg.chat.id,
    text: msg.text.trim(),
    messageId: msg.message_id,
  };
}

export async function handleWebhookCommand(
  text: string,
  config: OrchestratorConfig,
  outputDir: string
): Promise<string> {
  // Strip @botname suffix from commands (e.g., /update@MyBot -> /update)
  const normalized = text.replace(/^(\/\w+)@\w+/, "$1");

  // /update <ProjectName> <message>
  if (normalized.startsWith("/update ")) {
    return handleUpdate(normalized.slice(8).trim(), config, outputDir);
  }

  // /notes
  if (normalized === "/notes") {
    return handleNotes(outputDir);
  }

  // /clear <ProjectName>
  if (normalized.startsWith("/clear ")) {
    return handleClear(normalized.slice(7).trim(), config, outputDir);
  }

  // /status
  if (normalized === "/status") {
    return handleStatus(outputDir);
  }

  return "Unknown command. Available:\n/update <project> <message>\n/notes\n/clear <project>\n/status";
}

async function handleUpdate(
  args: string,
  config: OrchestratorConfig,
  outputDir: string
): Promise<string> {
  if (!args.includes(" ")) {
    return "Usage: /update <project> <message>\nExample: /update Offero shipped auth feature";
  }

  // Try matching the longest project name first (e.g., "Praxor Orchestrator" before "Praxor")
  const match = resolveProjectFromStart(args, config);
  if (!match) {
    const names = config.projects.map((p) => p.name).join(", ");
    return `Could not resolve project. Available: ${names}`;
  }

  const message = args.slice(match.matchLength).trim();
  if (!message) {
    return "Please provide a status message.";
  }

  const note = await addStatusNote(outputDir, match.name, message);
  const time = new Date(note.timestamp).toLocaleTimeString();
  return `\u2705 Noted for <b>${esc(match.name)}</b>:\n"${esc(message)}"\n<i>${time}</i>`;
}

function resolveProjectFromStart(
  text: string,
  config: OrchestratorConfig
): { name: string; matchLength: number } | null {
  const lower = text.toLowerCase();

  // Sort project names by length descending so longer names match first
  const sorted = [...config.projects].sort((a, b) => b.name.length - a.name.length);

  // Try " - " separator pattern first (e.g., "ProjectName - status message")
  // This handles typos and multi-word names with explicit separators
  const dashIndex = text.indexOf(" - ");
  if (dashIndex > 0) {
    const projectPart = text.slice(0, dashIndex).trim();
    const resolved = resolveProjectName(projectPart, config);
    if (resolved) {
      return { name: resolved, matchLength: dashIndex + 3 }; // skip past " - "
    }
  }

  // Exact prefix match against project names
  for (const project of sorted) {
    const nameLower = project.name.toLowerCase();
    if (lower.startsWith(nameLower + " ") || lower === nameLower) {
      return { name: project.name, matchLength: project.name.length };
    }
  }

  // Fallback: try single-word partial match
  const firstWord = text.split(" ")[0];
  const resolved = resolveProjectName(firstWord, config);
  if (resolved) {
    return { name: resolved, matchLength: firstWord.length };
  }

  return null;
}

async function handleNotes(outputDir: string): Promise<string> {
  const store = loadStatusNotes(outputDir);
  const recent = getRecentNotes(store.notes);

  if (recent.length === 0) {
    return "No status notes in the last 48 hours.";
  }

  const lines = ["\u{1F4DD} <b>Recent Status Notes</b>", ""];
  for (const note of recent) {
    const time = new Date(note.timestamp).toLocaleString();
    lines.push(`\u2022 <b>${esc(note.project)}</b>: ${esc(note.message)}`);
    lines.push(`  <i>${time}</i>`);
  }
  return lines.join("\n");
}

async function handleClear(
  projectQuery: string,
  config: OrchestratorConfig,
  outputDir: string
): Promise<string> {
  if (!projectQuery) {
    return "Usage: /clear <project>";
  }

  // Try full name match first, then fall back to partial
  const match = resolveProjectFromStart(projectQuery, config);
  const projectName = match?.name ?? resolveProjectName(projectQuery, config);
  if (!projectName) {
    const names = config.projects.map((p) => p.name).join(", ");
    return `Could not resolve project "${projectQuery}". Available: ${names}`;
  }

  const removed = await clearNotesForProject(outputDir, projectName);
  if (removed === 0) {
    return `No notes found for ${projectName}.`;
  }
  return `\u{1F5D1} Cleared ${removed} note${removed > 1 ? "s" : ""} for <b>${esc(projectName)}</b>.`;
}

async function handleStatus(outputDir: string): Promise<string> {
  const store = loadStatusNotes(outputDir);
  const recent = getRecentNotes(store.notes);
  const count = recent.length;
  return `\u{1F4CA} ${count} status note${count !== 1 ? "s" : ""} in the last 48h.\nUse /notes to see them.`;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
