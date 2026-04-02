import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadConfig, expandPath } from "./config";
import { scanGit, scanClaudeMd } from "./scanner";
import { computeHealth } from "./health";
import { printTable } from "./table";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram, formatTelegramBriefing } from "./telegram";
import type { ProjectReport } from "./types";

async function scanAll(): Promise<{ reports: ProjectReport[]; outputDir: string }> {
  const config = await loadConfig();
  const outputDir = expandPath(config.outputDir);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const reports: ProjectReport[] = await Promise.all(
    config.projects.map(async (project) => {
      const [git, claudeMd] = await Promise.all([
        scanGit(project),
        scanClaudeMd(project),
      ]);
      const health = computeHealth({ config: project, git });
      return { config: project, git, claudeMd, health };
    })
  );

  return { reports, outputDir };
}

async function main() {
  const command = process.argv[2];

  if (!command || !["status", "briefing", "sync", "notify"].includes(command)) {
    console.log("Usage: bun run <status|briefing|sync|notify>");
    process.exit(1);
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

    // Generate and write briefing + registry (full sync)
    const briefing = generateBriefing(reports, config);
    const briefingPath = join(outputDir, "BRIEFING.md");
    await Bun.write(briefingPath, briefing);
    console.log(`Briefing written to ${briefingPath}`);

    const registry = generateRegistry(reports);
    const registryPath = join(outputDir, "registry.json");
    await Bun.write(registryPath, JSON.stringify(registry, null, 2));
    console.log(`Registry written to ${registryPath}`);

    // Send compact summary to Telegram
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

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
