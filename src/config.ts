import { resolve } from "path";
import type { OrchestratorConfig } from "./types";

export async function loadConfig(): Promise<OrchestratorConfig> {
  const configPath = resolve(import.meta.dir, "..", "orchestrator.config.ts");
  const mod = await import(configPath);
  return mod.default as OrchestratorConfig;
}
