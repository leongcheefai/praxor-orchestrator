import { homedir } from "os";
import { resolve } from "path";
import type { OrchestratorConfig } from "./types";

export function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

export async function loadConfig(): Promise<OrchestratorConfig> {
  const configPath = resolve(import.meta.dir, "..", "orchestrator.config.ts");
  const mod = await import(configPath);
  return mod.default as OrchestratorConfig;
}
