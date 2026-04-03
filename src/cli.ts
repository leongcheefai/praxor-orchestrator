import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { resolve } from "path";
import { loadConfig } from "./config";
import { scanGit, scanClaudeMd, scanIssues } from "./scanner";
import { computeHealth } from "./health";
import { printTable } from "./table";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram, formatTelegramBriefing } from "./telegram";
import { computeMomentum } from "./momentum";
import { computeScores } from "./scoring";
import { evaluateAlerts } from "./alerts";
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

  return { reports, outputDir };
}

async function main() {
  const command = process.argv[2];

  if (!command || !["status", "briefing", "sync", "notify", "help"].includes(command)) {
    console.log("Usage: bun run src/cli.ts <status|briefing|sync|notify|help>");
    console.log("");
    console.log("Commands:");
    console.log("  status    Show project status table");
    console.log("  briefing  Generate and save BRIEFING.md");
    console.log("  sync      Generate BRIEFING.md + registry.json");
    console.log("  notify    Sync + send Telegram notification");
    console.log("  help      Show this help message");
    process.exit(command ? 0 : 1);
  }

  if (command === "help") {
    console.log("Usage: bun run src/cli.ts <status|briefing|sync|notify|help>");
    console.log("");
    console.log("Commands:");
    console.log("  status    Show project status table");
    console.log("  briefing  Generate and save BRIEFING.md");
    console.log("  sync      Generate BRIEFING.md + registry.json");
    console.log("  notify    Sync + send Telegram notification");
    console.log("  help      Show this help message");
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

    const message = formatTelegramBriefing(reports, config);
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
