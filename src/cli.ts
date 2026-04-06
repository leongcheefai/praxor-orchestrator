import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { resolve } from "path";
import { loadConfig } from "./config";
import { scanGit, scanClaudeMd, scanIssues } from "./scanner";
import { computeHealth } from "./health";
import { printTable } from "./table";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram, formatTelegramBriefing, setWebhook, deleteWebhook, getUpdates, sendTelegramReply, sanitizeTelegramHtml } from "./telegram";
import { computeMomentum } from "./momentum";
import { computeScores } from "./scoring";
import { evaluateAlerts } from "./alerts";
import { loadStatusNotes, getNotesForProject, getRecentNotes, addStatusNote, resolveProjectName } from "./status-notes";
import { parseTelegramUpdate, handleWebhookCommand } from "./webhook";
import { generateAIBriefing } from "./ai-briefing";
import type { ProjectReport } from "./types";

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

export async function scanAll(): Promise<{ reports: ProjectReport[]; outputDir: string }> {
  const config = await loadConfig();
  const outputDir = expandPath(config.outputDir);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const reports: ProjectReport[] = await Promise.all(
    config.projects.map(async (project) => {
      const git = await scanGit(project);
      const claudeMd = await scanClaudeMd(project, git.currentBranch || undefined);
      const health = computeHealth({ config: project, git });
      const momentum = computeMomentum(git);
      const issues = await scanIssues(project);
      const alerts = evaluateAlerts({
        config: project,
        git,
        claudeMd,
        health,
        momentum,
        issues,
        alerts: [],
      });
      return { config: project, git, claudeMd, health, momentum, issues, alerts };
    })
  );

  // Compute scores across all reports and attach to each report
  const scores = computeScores(reports);
  for (const score of scores) {
    const report = reports.find((r) => r.config.name === score.project);
    if (report) report.score = score;
  }

  // Attach recent status notes to each report
  const notesStore = loadStatusNotes(outputDir);
  const recentNotes = getRecentNotes(notesStore.notes);
  for (const report of reports) {
    const projectNotes = getNotesForProject(recentNotes, report.config.name);
    if (projectNotes.length > 0) {
      report.statusNotes = projectNotes;
    }
  }

  return { reports, outputDir };
}

async function main() {
  const command = process.argv[2];

  const allCommands = ["status", "briefing", "sync", "notify", "update", "setup-webhook", "poll", "help"];

  if (!command || !allCommands.includes(command)) {
    console.log("Usage: bun run src/cli.ts <command>");
    console.log("");
    console.log("Commands:");
    console.log("  status          Show project status table");
    console.log("  briefing        Generate and save BRIEFING.md");
    console.log("  sync            Generate BRIEFING.md + registry.json");
    console.log("  notify          Sync + send Telegram notification");
    console.log('  update          Add a status note: update "Project" "message"');
    console.log("  setup-webhook   Register Telegram webhook: setup-webhook <url>");
    console.log("  poll            Start local polling for Telegram commands");
    console.log("  help            Show this help message");
    process.exit(command ? 0 : 1);
  }

  if (command === "help") {
    console.log("Usage: bun run src/cli.ts <command>");
    console.log("");
    console.log("Commands:");
    console.log("  status          Show project status table");
    console.log("  briefing        Generate and save BRIEFING.md");
    console.log("  sync            Generate BRIEFING.md + registry.json");
    console.log("  notify          Sync + send Telegram notification");
    console.log('  update          Add a status note: update "Project" "message"');
    console.log("  setup-webhook   Register Telegram webhook: setup-webhook <url>");
    console.log("  poll            Start local polling for Telegram commands");
    console.log("  help            Show this help message");
    process.exit(0);
  }

  if (command === "setup-webhook") {
    const domain = process.argv[3];
    if (!domain) {
      console.error("Usage: bun run src/cli.ts setup-webhook <base-url>");
      console.error("Example: bun run src/cli.ts setup-webhook https://orchestrator.up.railway.app");
      process.exit(1);
    }
    const webhookUrl = `${domain.replace(/\/$/, "")}/webhook/telegram`;
    await setWebhook(webhookUrl);
    console.log(`Telegram webhook registered: ${webhookUrl}`);
    process.exit(0);
  }

  if (command === "poll") {
    // Clear any existing webhook so getUpdates works
    await deleteWebhook();
    console.log("Polling for Telegram messages... (Ctrl+C to stop)");

    const cfg = await loadConfig();
    const outDir = expandPath(cfg.outputDir);
    let offset: number | undefined;

    while (true) {
      try {
        const updates = await getUpdates(offset);
        for (const update of updates) {
          offset = update.update_id + 1;
          const msg = parseTelegramUpdate(update);
          if (!msg) continue;

          const expectedChatId = process.env.TELEGRAM_CHAT_ID;
          if (!expectedChatId || msg.chatId.toString() !== expectedChatId) continue;

          console.log(`> ${msg.text}`);
          const reply = await handleWebhookCommand(msg.text, cfg, outDir);
          await sendTelegramReply(reply, msg.messageId);
          console.log(`< ${reply.replace(/<[^>]*>/g, "")}`);
        }
      } catch (err) {
        console.error("Poll error:", (err as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  if (command === "update") {
    const projectQuery = process.argv[3];
    const message = process.argv[4];
    if (!projectQuery || !message) {
      console.error('Usage: bun run src/cli.ts update "ProjectName" "status message"');
      process.exit(1);
    }
    const cfg = await loadConfig();
    const outDir = expandPath(cfg.outputDir);
    const projectName = resolveProjectName(projectQuery, cfg);
    if (!projectName) {
      console.error(`Could not resolve project "${projectQuery}". Available: ${cfg.projects.map((p) => p.name).join(", ")}`);
      process.exit(1);
    }
    const note = await addStatusNote(outDir, projectName, message);
    console.log(`Added note for ${projectName}: "${message}" (${note.timestamp})`);
    process.exit(0);
  }

  const config = await loadConfig();
  const { reports, outputDir } = await scanAll();

  if (command === "status") {
    printTable(reports);
  }

  if (command === "briefing" || command === "sync") {
    const briefing = generateBriefing(reports, config);
    const briefingPath = join(outputDir, "BRIEFING.md");
    await Bun.write(briefingPath, briefing);
    console.log(`Briefing written to ${briefingPath}`);
  }

  if (command === "sync") {
    const registry = generateRegistry(reports);
    const registryPath = join(outputDir, "registry.json");
    await Bun.write(registryPath, JSON.stringify(registry, null, 2));
    console.log(`Registry written to ${registryPath}`);
  }

  if (command === "notify") {
    if (!config.telegram?.enabled) {
      console.log("Telegram notifications are disabled in config.");
      process.exit(0);
    }

    const briefing = generateBriefing(reports, config);
    const briefingPath = join(outputDir, "BRIEFING.md");
    await Bun.write(briefingPath, briefing);
    console.log(`Briefing written to ${briefingPath}`);

    const registry = generateRegistry(reports);
    const registryPath = join(outputDir, "registry.json");
    await Bun.write(registryPath, JSON.stringify(registry, null, 2));
    console.log(`Registry written to ${registryPath}`);

    const rawMessage = await generateAIBriefing(registry, config);
    const message = sanitizeTelegramHtml(rawMessage);
    try {
      await sendTelegram(message);
      console.log("Telegram notification sent successfully.");
    } catch (err) {
      console.error("Failed to send Telegram notification:", (err as Error).message);
      process.exit(1);
    }
  }
}

// Only run CLI when executed directly (not imported by server/cron)
if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
