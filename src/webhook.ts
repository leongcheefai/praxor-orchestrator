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
  // /update <ProjectName> <message>
  if (text.startsWith("/update ")) {
    return handleUpdate(text.slice(8).trim(), config, outputDir);
  }

  // /notes
  if (text === "/notes" || text.startsWith("/notes")) {
    return handleNotes(outputDir);
  }

  // /clear <ProjectName>
  if (text.startsWith("/clear ")) {
    return handleClear(text.slice(7).trim(), config, outputDir);
  }

  // /status
  if (text === "/status" || text.startsWith("/status")) {
    return handleStatus(outputDir);
  }

  return "Unknown command. Available:\n/update <project> <message>\n/notes\n/clear <project>\n/status";
}

async function handleUpdate(
  args: string,
  config: OrchestratorConfig,
  outputDir: string
): Promise<string> {
  // First word is project name, rest is message
  const spaceIdx = args.indexOf(" ");
  if (spaceIdx === -1) {
    return "Usage: /update <project> <message>\nExample: /update Offero shipped auth feature";
  }

  const projectQuery = args.slice(0, spaceIdx);
  const message = args.slice(spaceIdx + 1).trim();

  if (!message) {
    return "Please provide a status message.";
  }

  const projectName = resolveProjectName(projectQuery, config);
  if (!projectName) {
    const names = config.projects.map((p) => p.name).join(", ");
    return `Could not resolve project "${projectQuery}". Available: ${names}`;
  }

  const note = await addStatusNote(outputDir, projectName, message);
  const time = new Date(note.timestamp).toLocaleTimeString();
  return `\u2705 Noted for <b>${esc(projectName)}</b>:\n"${esc(message)}"\n<i>${time}</i>`;
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

  const projectName = resolveProjectName(projectQuery, config);
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
