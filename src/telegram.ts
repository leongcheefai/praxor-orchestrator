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

  lines.push(`*\u{1F50D} Morning Briefing*`);
  lines.push(`_${formatDate(now)}_`);
  lines.push("");

  // Attention Needed (alerts)
  const allAlerts = reports.flatMap((r) => r.alerts);
  if (allAlerts.length > 0) {
    lines.push("*\u26A0\uFE0F Attention Needed*");
    const severityIcon: Record<string, string> = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
    for (const alert of allAlerts) {
      lines.push(`${severityIcon[alert.severity]} ${escapeMd(alert.message)}`);
    }
    lines.push("");
  }

  // Today's Focus — top 3
  const scored = reports
    .filter((r) => r.score)
    .sort((a, b) => b.score!.score - a.score!.score)
    .slice(0, 3);

  if (scored.length > 0) {
    lines.push("*\u{1F3AF} Today's Focus*");
    scored.forEach((r, i) => {
      lines.push(`${i + 1}\\. *${escapeMd(r.config.name)}* \\(${r.score!.score.toFixed(2)}\\) \u2014 ${escapeMd(r.score!.reasoning)}`);
    });
    lines.push("");
  }

  // Momentum summary
  const active = reports.filter((r) => r.config.status === "active");
  if (active.length > 0) {
    const trendIcon: Record<string, string> = { building: "\u{1F7E2}", steady: "\u{1F7E1}", cooling: "\u{1F7E0}", lost: "\u{1F534}" };
    lines.push("*\u{1F4C8} Momentum*");
    for (const r of active) {
      const streak = r.momentum.streak > 0 ? `${r.momentum.streak}d streak` : "";
      const trend = `${trendIcon[r.momentum.trend]} ${r.momentum.trend}`;
      lines.push(`${trend} *${escapeMd(r.config.name)}* ${streak}`);
    }
    lines.push("");
  }

  // Parked projects
  const parked = reports.filter((r) => r.config.status === "parked");
  if (parked.length > 0) {
    lines.push("*\u{1F4A4} Parked*");
    for (const r of parked) {
      const reason = r.config.parkedReason
        ? ` \u2014 ${escapeMd(r.config.parkedReason)}`
        : "";
      lines.push(`\u26AA ${escapeMd(r.config.name)}${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function escapeMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
