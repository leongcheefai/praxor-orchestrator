# Orchestrator

A lightweight CLI tool that scans your project portfolio, gathers Git activity and development context, and generates AI-powered briefings via Telegram — giving you a bird's-eye view of all your projects at a glance.

## Features

- **Project scanning** — reads Git status (last commit, branch, uncommitted changes) and parses `CLAUDE.md` files for goals, tasks, and known issues
- **Health indicators** — 🟢 active (≤2 days), 🟡 cooling (≤7 days), 🔴 stale (>7 days), ⚪ parked, ❓ no git
- **AI-powered briefing** — generates a Telegram briefing via Claude Haiku that synthesizes cross-project insights, flags context-switching patterns, and gives actionable recommendations
- **Morning briefing** — generates a `BRIEFING.md` with alerts, active/parked project summaries, and a suggested daily focus
- **Project registry** — exports all project metadata as `registry.json` for programmatic access
- **Telegram integration** — two-way communication: receive daily briefings, update project status via `/update`, view notes via `/notes`
- **Momentum tracking** — streak detection, activity trends (building/steady/cooling/lost), and session analysis
- **Scoring engine** — weighted prioritization across priority, momentum, impact, and engagement
- **Budget tracking** — optional client name and budget fields for client projects

## Requirements

- [Bun](https://bun.sh) runtime
- `ANTHROPIC_API_KEY` — for AI-generated briefings
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` — for Telegram notifications

## Setup

1. Install Bun if you haven't already
2. Clone this repo
3. Configure your projects in `orchestrator.config.ts`:

```ts
{
  name: "my-project",
  path: "/absolute/path/to/project",
  type: "saas" | "client" | "micro-tool",
  platform: "web" | "ios" | "both",
  status: "active" | "parked",
  description: "What this project does",
  // Optional fields for client projects:
  clientName: "Client Name",
  budget: { total: 50000, invoiced: 25000, currency: "USD" },
  // Optional fields for parked projects:
  parkedReason: "Why it's paused",
  reactivateWhen: "Trigger to resume",
}
```

## Usage

```bash
bun run status          # Show project status table in terminal
bun run briefing        # Generate morning briefing (output/BRIEFING.md)
bun run sync            # Generate briefing + registry (output/registry.json)
bun run notify          # Sync + send AI-generated Telegram briefing
bun run update          # Add a status note: update "Project" "message"
bun run poll            # Start polling for Telegram commands
bun run setup-webhook   # Register Telegram webhook: setup-webhook <url>
```

## Project Structure

```
src/
  cli.ts           # CLI entry point & command routing
  ai-briefing.ts   # AI-powered briefing via Claude API
  scanner.ts       # Git & CLAUDE.md scanning logic
  scoring.ts       # Weighted prioritization engine
  momentum.ts      # Streak & trend computation
  alerts.ts        # Rule-based alert system
  health.ts        # Health status computation
  briefing.ts      # Briefing & registry generation
  telegram.ts      # Telegram bot integration
  webhook.ts       # Telegram command handler
  status-notes.ts  # Persistent project status notes
  table.ts         # Terminal table formatting
  config.ts        # Configuration loading
  types.ts         # TypeScript interfaces
prompts/
  briefing.md      # System prompt for AI briefing (editable)
```

## AI Briefing

The `notify` command generates a Telegram briefing using Claude Haiku instead of a static template. The AI analyzes your full project registry and delivers a briefing that reads like advice from a project manager — identifying what to focus on, flagging context-switching, and connecting your status notes to actual git activity.

To customize the briefing tone or structure, edit `prompts/briefing.md`. No code changes needed.
