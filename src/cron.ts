import { loadConfig } from "./config";
import { scanAll } from "./cli";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram } from "./telegram";
import { generateAIBriefing } from "./ai-briefing";

async function main() {
  const start = new Date();
  console.log(`[cron] started at ${start.toISOString()}`);

  const config = await loadConfig();
  const { reports, outputDir } = await scanAll();

  const briefing = generateBriefing(reports, config);
  await Bun.write(`${outputDir}/BRIEFING.md`, briefing);

  const registry = generateRegistry(reports);
  await Bun.write(`${outputDir}/registry.json`, JSON.stringify(registry, null, 2));

  if (config.telegram?.enabled) {
    const message = await generateAIBriefing(registry, config);
    await sendTelegram(message);
    console.log("[cron] AI Telegram notification sent");
  }

  const end = new Date();
  console.log(`[cron] finished at ${end.toISOString()} (${end.getTime() - start.getTime()}ms)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[cron] Error:", err.message);
    process.exit(1);
  });
