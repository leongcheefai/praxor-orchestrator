import type { ProjectReport, OrchestratorConfig } from "./types";

const TELEGRAM_MAX_LENGTH = 4096;

function getCredentials(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error(
      "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables"
    );
  }

  return { token, chatId };
}

export async function sendTelegram(message: string): Promise<void> {
  const { token, chatId } = getCredentials();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const chunks = splitMessage(message);

  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram API error (${res.status}): ${body}`);
    }
  }
}

function splitMessage(message: string): string[] {
  if (message.length <= TELEGRAM_MAX_LENGTH) return [message];

  const chunks: string[] = [];
  const lines = message.split("\n");
  let current = "";

  for (const line of lines) {
    if (current.length + line.length + 1 > TELEGRAM_MAX_LENGTH) {
      chunks.push(current.trimEnd());
      current = "";
    }
    current += line + "\n";
  }

  if (current.trim()) {
    chunks.push(current.trimEnd());
  }

  return chunks;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTelegramBriefing(
  reports: ProjectReport[],
  config: OrchestratorConfig
): string {
  const lines: string[] = [];
  const now = new Date();

  lines.push(`*🔍 Morning Briefing*`);
  lines.push(`_${formatDate(now)}_`);
  lines.push("");

  // Alerts
  const stale = reports.filter(
    (r) =>
      r.config.status === "active" &&
      r.git.hasGit &&
      r.git.daysSinceLastCommit > config.stalenessThresholdDays
  );
  const uncommitted = reports.filter(
    (r) => r.config.status === "active" && r.git.uncommittedChanges
  );
  const missingClaude = reports.filter(
    (r) => r.config.status === "active" && r.git.hasGit && !r.claudeMd.exists
  );

  if (stale.length > 0 || uncommitted.length > 0 || missingClaude.length > 0) {
    lines.push("*⚠️ Alerts*");
    for (const r of stale) {
      lines.push(
        `🔴 *${escapeMd(r.config.name)}* stale (${r.git.daysSinceLastCommit}d)`
      );
    }
    for (const r of uncommitted) {
      lines.push(
        `📦 *${escapeMd(r.config.name)}* uncommitted on ${escapeMd(r.git.currentBranch)}`
      );
    }
    for (const r of missingClaude) {
      lines.push(`📝 *${escapeMd(r.config.name)}* missing CLAUDE.md`);
    }
    lines.push("");
  }

  // Active projects - one line per project
  const active = reports
    .filter((r) => r.config.status === "active")
    .sort((a, b) => {
      if (!a.git.lastCommitDate) return 1;
      if (!b.git.lastCommitDate) return -1;
      return b.git.lastCommitDate.getTime() - a.git.lastCommitDate.getTime();
    });

  if (active.length > 0) {
    lines.push("*📊 Projects*");
    for (const r of active) {
      const days = r.git.hasGit ? `${r.git.daysSinceLastCommit}d ago` : "no git";
      const goal = r.claudeMd.currentGoal
        ? ` — ${escapeMd(r.claudeMd.currentGoal)}`
        : "";
      lines.push(`${r.health} *${escapeMd(r.config.name)}* (${days})${goal}`);
    }
    lines.push("");
  }

  // Parked projects
  const parked = reports.filter((r) => r.config.status === "parked");
  if (parked.length > 0) {
    lines.push("*💤 Parked*");
    for (const r of parked) {
      const reason = r.config.parkedReason
        ? ` — ${escapeMd(r.config.parkedReason)}`
        : "";
      lines.push(`⚪ ${escapeMd(r.config.name)}${reason}`);
    }
    lines.push("");
  }

  // Daily focus
  if (active.length > 0) {
    const top = active[0];
    lines.push(`*🎯 Focus:* ${escapeMd(top.config.name)}`);
    if (top.claudeMd.currentGoal) {
      lines.push(escapeMd(top.claudeMd.currentGoal));
    }
    if (uncommitted.length > 0) {
      lines.push(
        `\n⚠️ Commit pending: ${uncommitted.map((r) => escapeMd(r.config.name)).join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

function escapeMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
