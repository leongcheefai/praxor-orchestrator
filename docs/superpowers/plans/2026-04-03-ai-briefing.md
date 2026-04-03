# AI-Enhanced Telegram Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template-based Telegram briefing with a Claude Haiku-generated briefing that synthesizes cross-project insights and gives actionable recommendations.

**Architecture:** A new `ai-briefing.ts` module loads a system prompt from `prompts/briefing.md`, injects `registry.json` as context, calls Claude Haiku via direct fetch, and returns Telegram HTML. The `notify` command swaps from `formatTelegramBriefing()` to `generateAIBriefing()`. All existing modules remain untouched.

**Tech Stack:** Bun, TypeScript, Claude Messages API (direct fetch), Telegram Bot API

---

### Task 1: Add AI config type and config

**Files:**
- Modify: `src/types.ts:18-25` (add `ai` field to `OrchestratorConfig`)
- Modify: `orchestrator.config.ts:8` (add `ai` config block)

- [ ] **Step 1: Add AIConfig type to types.ts**

In `src/types.ts`, add the `ai` field to the `OrchestratorConfig` interface:

```typescript
export interface OrchestratorConfig {
  outputDir: string;
  stalenessThresholdDays: number;
  telegram?: TelegramConfig;
  ai?: {
    model: string;
  };
  projects: ProjectConfig[];
}
```

- [ ] **Step 2: Add ai config to orchestrator.config.ts**

In `orchestrator.config.ts`, add the `ai` block after the `telegram` config:

```typescript
telegram: {
  enabled: true,
},
ai: {
  model: "claude-haiku-4-5-20251001",
},
```

- [ ] **Step 3: Verify types compile**

Run: `bun build src/types.ts --no-bundle 2>&1 | head -5`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts orchestrator.config.ts
git commit -m "feat: add AI config type and configuration"
```

---

### Task 2: Create the briefing prompt template

**Files:**
- Create: `prompts/briefing.md`

- [ ] **Step 1: Create the prompts directory and briefing.md**

Create `prompts/briefing.md` with this content:

```markdown
You are a project manager briefing a solo developer who manages multiple projects. Be concise, opinionated, and actionable.

You receive a JSON registry of all projects. Each project has: git activity (last commit, branch, streak), momentum (trend: building/steady/cooling/lost), a priority score with factors, open issues, alerts, and optional status notes the developer wrote.

Your job:

1. Lead with the single most important thing to focus on today and explain WHY using the data. Reference specific numbers — streak length, days since last commit, issue counts.
2. Flag cross-project patterns: context-switching across too many projects, neglected high-priority work, momentum being lost on something important.
3. If status notes exist, connect them to git activity. If the developer said "shipping auth feature" but commits stopped 3 days ago, call that out.
4. Surface anything urgent: client projects losing momentum, bugs accumulating, high-priority projects going stale.
5. Parked projects get one line max, only if something noteworthy changed.

Output rules:
- Telegram HTML only: use <b>, <i>, <code> tags. No markdown.
- Use emoji for visual structure (🎯 for focus, ⚠️ for warnings, 📈 for momentum, 💤 for parked).
- Keep total output under 2000 characters.
- No greeting, no sign-off, no "here's your briefing". Start directly with what matters.
- Be direct like a smart colleague, not formal like a report.
```

- [ ] **Step 2: Verify the file exists and is readable**

Run: `wc -l prompts/briefing.md`
Expected: ~20 lines

- [ ] **Step 3: Commit**

```bash
git add prompts/briefing.md
git commit -m "feat: add AI briefing system prompt template"
```

---

### Task 3: Create the ai-briefing module

**Files:**
- Create: `src/ai-briefing.ts`

- [ ] **Step 1: Create src/ai-briefing.ts**

```typescript
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { OrchestratorConfig } from "./types";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
```

- [ ] **Step 2: Verify it compiles**

Run: `bun build src/ai-briefing.ts --no-bundle 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ai-briefing.ts
git commit -m "feat: add AI briefing module with Claude API integration"
```

---

### Task 4: Integrate into the notify command

**Files:**
- Modify: `src/cli.ts:193-217` (notify command block)

- [ ] **Step 1: Add import for generateAIBriefing**

At the top of `src/cli.ts`, add the import alongside the existing ones:

```typescript
import { generateAIBriefing } from "./ai-briefing";
```

- [ ] **Step 2: Swap the Telegram message generation in the notify command**

In `src/cli.ts`, replace the notify command's message generation. Change this line:

```typescript
    const message = formatTelegramBriefing(reports, config);
```

To:

```typescript
    const message = await generateAIBriefing(registry, config);
```

The `registry` variable is already created on line 204 (two lines above). The full notify block should now read:

```typescript
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

    const message = await generateAIBriefing(registry, config);
    try {
      await sendTelegram(message);
      console.log("Telegram notification sent successfully.");
    } catch (err) {
      console.error("Failed to send Telegram notification:", (err as Error).message);
      process.exit(1);
    }
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `bun build src/cli.ts --no-bundle 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: use AI-generated briefing for Telegram notifications"
```

---

### Task 5: Manual end-to-end test

**Files:** None (testing only)

- [ ] **Step 1: Verify ANTHROPIC_API_KEY is set**

Run: `echo $ANTHROPIC_API_KEY | head -c 10`
Expected: First 10 chars of your API key (e.g. `sk-ant-api`)

If not set, export it: `export ANTHROPIC_API_KEY=sk-ant-api03-...`

- [ ] **Step 2: Test the AI briefing in isolation**

Create a quick test script and run it:

Run:
```bash
bun -e "
import { generateAIBriefing } from './src/ai-briefing';
import { loadConfig } from './src/config';

const config = await loadConfig();
const mockRegistry = {
  generatedAt: new Date().toISOString(),
  projects: [{
    name: 'TestProject', repo: 'test/test', branch: 'main',
    type: 'saas', platform: 'web', status: 'active',
    description: 'A test project', priority: 'high',
    health: '🟢',
    git: { hasGit: true, lastCommitDate: '2026-04-01T10:00:00Z', lastCommitMessage: 'feat: add auth', daysSinceLastCommit: 2, currentBranch: 'main', uncommittedChanges: false },
    claudeMd: { exists: true, currentGoal: 'Ship auth feature', inProgress: ['OAuth integration'], knownIssues: [] },
    momentum: { streak: 3, daysSinceLastCommit: 2, lastSessionCommits: 4, lastSessionDuration: '2h', lastSessionDate: '2026-04-01', trend: 'cooling' },
    issues: { total: 5, bugs: 2 },
    score: { score: 0.78, reasoning: 'High priority, cooling off', factors: { priority: 1.0, momentum: 0.8, impact: 0.5, engagement: 0.0 } },
    alerts: ['High-priority project losing momentum']
  }]
};

const result = await generateAIBriefing(mockRegistry, config);
console.log('--- AI Briefing Output ---');
console.log(result);
console.log('--- Length:', result.length, 'chars ---');
"
```

Expected: A Telegram HTML formatted briefing, under 2000 characters, with emoji and `<b>`/`<i>` tags.

- [ ] **Step 3: Run the full notify command (sends to Telegram)**

Run: `bun run notify`

Expected:
- "Briefing written to ..." printed
- "Registry written to ..." printed
- "Telegram notification sent successfully." printed
- Check your Telegram — you should see an AI-generated briefing instead of the old template format

- [ ] **Step 4: Commit the env var to Railway (if deployed)**

If you deploy on Railway, add `ANTHROPIC_API_KEY` to your Railway service variables:

Run: `railway variables set ANTHROPIC_API_KEY=sk-ant-api03-...`

Or add via the Railway dashboard.
