# AI-Enhanced Telegram Briefing

Replace the template-based Telegram briefing with a Claude Haiku-generated briefing that reads like advice from a smart project manager — synthesizing cross-project insights, connecting status notes to git activity, and giving actionable recommendations with reasoning.

## Scope

- AI generation applies **only to the Telegram briefing** (`notify` command)
- `BRIEFING.md` and `registry.json` remain template-based and unchanged
- All existing modules (scanner, scoring, alerts, momentum) are untouched
- No fallback — always use AI. If the API fails, the command fails and can be re-run.

## Architecture

```
scanner → scoring → briefing.ts → BRIEFING.md        (unchanged)
                  ↘ registry.json → ai-briefing.ts → telegram.ts
                                     + prompts/briefing.md
```

The existing pipeline generates `registry.json` as usual. A new `ai-briefing.ts` module loads a prompt template, injects the registry as context, calls Claude Haiku, and returns a Telegram HTML string. The `notify` command swaps from `formatTelegramBriefing()` to `generateAIBriefing()`.

## New Files

### `src/ai-briefing.ts`

Single exported function:

```typescript
export async function generateAIBriefing(
  registry: object,
  config: OrchestratorConfig
): Promise<string>
```

Internal steps:
1. Load `prompts/briefing.md` from disk (resolved via `import.meta.dir` to find project root, same as how config is loaded)
2. Build user message: `Today is {date}.\n\n{registry JSON}`
3. Call Claude API via direct `fetch` to `api.anthropic.com/v1/messages`
4. Extract `content[0].text` from response, return as-is

Design decisions:
- **Direct fetch, no SDK** — consistent with how `telegram.ts` works. Keeps the project zero-dependency.
- **API key from env** — `ANTHROPIC_API_KEY`, same pattern as `TELEGRAM_BOT_TOKEN`.
- **No retry logic** — if the API fails, throw. Daily cron can re-run.
- **max_tokens: 1024** — keeps output concise (~800 chars) and well under Telegram's 4096 char limit.

### `prompts/briefing.md`

System prompt for the Claude API call. Defines:

- **Role**: Project manager briefing a solo developer managing multiple projects. Concise, opinionated, actionable.
- **Input description**: JSON registry with git activity, momentum, scores, issues, alerts, and status notes. Today's date provided.
- **Analysis instructions**:
  1. Identify the top project to focus on and explain why using the data
  2. Flag cross-project patterns (context-switching, neglected high-priority, momentum loss)
  3. Connect status notes to git activity ("you said X, but commits show Y")
  4. Surface anything urgent (client projects cooling, bugs accumulating)
  5. Keep parked projects to a one-liner unless something changed
- **Output format**: Telegram HTML only (`<b>`, `<i>`, `<code>`). Use emoji for visual structure. Keep total under 2000 characters. No markdown.
- **Tone**: Direct, like a smart colleague. No fluff, no "here's your briefing!", no corporate speak. Lead with what matters most.

## Modified Files

### `src/types.ts`

Add optional `ai` field to `OrchestratorConfig`:

```typescript
ai?: {
  model: string;
}
```

### `orchestrator.config.ts`

Add AI config block:

```typescript
ai: {
  model: "claude-haiku-4-5-20251001",
}
```

### `src/cli.ts`

In the `notify` command, swap the briefing generation:

```typescript
// Before
const telegramMsg = formatTelegramBriefing(reports, config);

// After
const registry = generateRegistry(reports);
const telegramMsg = await generateAIBriefing(registry, config);
```

## Unchanged Files

- `scanner.ts` — still scans GitHub repos
- `scoring.ts` — scores still computed deterministically
- `briefing.ts` — `BRIEFING.md` still template-based
- `telegram.ts` — `sendTelegram()` still sends whatever string it gets
- `server.ts` / `cron.ts` — call the same CLI pipeline
- `formatTelegramBriefing()` — kept in code, just no longer called by notify

## Environment Variables

```
# Existing
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# New
ANTHROPIC_API_KEY=...
```

## Change Summary

| File | Change |
|------|--------|
| `src/ai-briefing.ts` | New (~40 lines) |
| `prompts/briefing.md` | New (~30 lines) |
| `src/types.ts` | Add `ai?` field to config type |
| `orchestrator.config.ts` | Add `ai` config block |
| `src/cli.ts` | Swap briefing call in notify command |
