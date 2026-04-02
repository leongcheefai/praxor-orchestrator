import { loadConfig } from "./config";
import { scanAll } from "./cli";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram, formatTelegramBriefing } from "./telegram";

let lastSync: string | null = null;
let lastReports: any[] = [];
let lastBriefing: string = "";

const port = parseInt(process.env.PORT || "3000", 10);

async function runSync() {
  const config = await loadConfig();
  const { reports } = await scanAll();
  lastReports = reports;
  lastBriefing = generateBriefing(reports, config);
  lastSync = new Date().toISOString();
  return { reports, config };
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        lastSync,
        projectCount: lastReports.length,
      });
    }

    if (url.pathname === "/status") {
      if (lastReports.length === 0) {
        await runSync();
      }
      const registry = generateRegistry(lastReports);
      return Response.json(registry);
    }

    if (url.pathname === "/briefing") {
      if (!lastBriefing) {
        await runSync();
      }
      return new Response(lastBriefing, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/trigger") {
      try {
        const { reports, config } = await runSync();
        const message = formatTelegramBriefing(reports, config);

        if (config.telegram?.enabled) {
          await sendTelegram(message);
        }

        return Response.json({
          status: "ok",
          synced: lastSync,
          projectCount: reports.length,
          telegramSent: config.telegram?.enabled ?? false,
        });
      } catch (err) {
        return Response.json(
          { status: "error", message: (err as Error).message },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Orchestrator server running on port ${port}`);
