import { loadConfig } from "./config";
import { scanAll } from "./cli";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram, sendTelegramReply, setWebhook } from "./telegram";
import { generateAIBriefing } from "./ai-briefing";
import { parseTelegramUpdate, handleWebhookCommand } from "./webhook";
import { resolve } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

let lastSync: string | null = null;
let lastReports: any[] = [];
let lastBriefing: string = "";

const port = parseInt(process.env.PORT || "3000", 10);

function resolveOutputDir(outputDir: string): string {
  return outputDir.startsWith("~")
    ? resolve(homedir(), outputDir.slice(2))
    : resolve(outputDir);
}

async function runSync() {
  const config = await loadConfig();
  const { reports } = await scanAll();
  lastReports = reports;
  lastBriefing = generateBriefing(reports, config);
  lastSync = new Date().toISOString();
  return { reports, config };
}

// Pre-load config and resolve outputDir once at startup
let cachedConfig: Awaited<ReturnType<typeof loadConfig>> | null = null;
let cachedOutputDir: string | null = null;

async function getConfigAndOutputDir() {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
    cachedOutputDir = resolveOutputDir(cachedConfig.outputDir);
    if (!existsSync(cachedOutputDir)) {
      mkdirSync(cachedOutputDir, { recursive: true });
    }
  }
  return { config: cachedConfig, outputDir: cachedOutputDir! };
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

    if (url.pathname === "/webhook/telegram" && req.method === "POST") {
      let msg: ReturnType<typeof parseTelegramUpdate> = null;
      try {
        const body = await req.json();
        msg = parseTelegramUpdate(body);
        if (!msg) {
          console.log("[webhook] Ignored update: no text/chat/message_id");
          return new Response("ok");
        }

        // Validate chat ID
        const expectedChatId = process.env.TELEGRAM_CHAT_ID;
        if (!expectedChatId) {
          console.error("[webhook] TELEGRAM_CHAT_ID not set — ignoring message");
          return new Response("ok");
        }
        if (msg.chatId.toString() !== expectedChatId) {
          console.log(`[webhook] Chat ID mismatch: got ${msg.chatId}, expected ${expectedChatId}`);
          return new Response("ok");
        }

        const { config, outputDir } = await getConfigAndOutputDir();

        console.log(`[webhook] Processing: ${msg.text}`);
        const reply = await handleWebhookCommand(msg.text, config, outputDir);
        console.log(`[webhook] Reply: ${reply.replace(/<[^>]*>/g, "").slice(0, 100)}`);

        await sendTelegramReply(reply, msg.messageId).catch((err) => {
          console.error("[webhook] Failed to send reply:", (err as Error).message);
        });

        return new Response("ok");
      } catch (err) {
        console.error("[webhook] Error:", (err as Error).message);
        if (msg) {
          await sendTelegramReply(`Error: ${(err as Error).message}`, msg.messageId).catch((replyErr) => {
            console.error("[webhook] Failed to send error reply:", (replyErr as Error).message);
          });
        }
        return new Response("ok");
      }
    }

    if (url.pathname === "/trigger") {
      try {
        const { reports, config } = await runSync();
        const registry = generateRegistry(reports);
        const message = await generateAIBriefing(registry, config);

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

// Startup: validate env, register webhook, initialize output dir
async function startup() {
  console.log(`[server] Orchestrator running on port ${port}`);

  // Validate required env vars
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) console.warn("[server] WARNING: TELEGRAM_BOT_TOKEN not set — bot commands will not work");
  if (!chatId) console.warn("[server] WARNING: TELEGRAM_CHAT_ID not set — bot commands will be ignored");

  // Initialize config and output dir
  try {
    const { outputDir } = await getConfigAndOutputDir();
    console.log(`[server] Output dir: ${outputDir}`);
  } catch (err) {
    console.error("[server] Failed to load config:", (err as Error).message);
  }

  // Auto-register webhook if PUBLIC_URL or RAILWAY_PUBLIC_DOMAIN is available
  const publicUrl = process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
  if (publicUrl && token) {
    const webhookUrl = `${publicUrl.replace(/\/$/, "")}/webhook/telegram`;
    try {
      await setWebhook(webhookUrl);
      console.log(`[server] Telegram webhook registered: ${webhookUrl}`);
    } catch (err) {
      console.error("[server] Failed to register webhook:", (err as Error).message);
    }
  } else if (token && !publicUrl) {
    console.warn("[server] No PUBLIC_URL or RAILWAY_PUBLIC_DOMAIN set — webhook not auto-registered");
    console.warn("[server] Run: bun run setup-webhook <your-url> to register manually");
  }
}

startup();
