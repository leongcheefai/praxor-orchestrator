import { readFileSync } from "fs";
import { resolve } from "path";
import type { OrchestratorConfig } from "./types";

const PROJECT_ROOT = resolve(import.meta.dir, "..");

export async function generateAIBriefing(
  registry: object,
  config: OrchestratorConfig
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable");
  }

  const model = config.ai?.model ?? "claude-haiku-4-5-20251001";
  const systemPrompt = readFileSync(
    join(PROJECT_ROOT, "prompts", "briefing.md"),
    "utf-8"
  );

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const userMessage = `Today is ${today}.\n\n${JSON.stringify(registry, null, 2)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };

  return data.content[0].text;
}
