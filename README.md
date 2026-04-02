# Orchestrator

A lightweight, zero-dependency CLI tool that scans your project portfolio, gathers Git activity and development context, and generates briefings and registries — giving you a bird's-eye view of all your projects at a glance.

## Features

- **Project scanning** — reads Git status (last commit, branch, uncommitted changes) and parses `CLAUDE.md` files for goals, tasks, and known issues
- **Health indicators** — 🟢 active (≤2 days), 🟡 cooling (≤7 days), 🔴 stale (>7 days), ⚪ parked, ❓ no git
- **Morning briefing** — generates a `BRIEFING.md` with alerts, active/parked project summaries, and a suggested daily focus
- **Project registry** — exports all project metadata as `registry.json` for programmatic access
- **Budget tracking** — optional client name and budget fields for client projects

## Requirements

- [Bun](https://bun.sh) runtime

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
# Show project status table in terminal
bun run src/cli.ts status

# Generate morning briefing (output/BRIEFING.md)
bun run src/cli.ts briefing

# Generate briefing + registry (output/BRIEFING.md + output/registry.json)
bun run src/cli.ts sync
```

Or via npm scripts:

```bash
bun run status
bun run briefing
bun run sync
```

## Project Structure

```
src/
  cli.ts        # CLI entry point & command routing
  scanner.ts    # Git & CLAUDE.md scanning logic
  health.ts     # Health status computation
  briefing.ts   # Briefing & registry generation
  table.ts      # Terminal table formatting
  config.ts     # Configuration loading
  types.ts      # TypeScript interfaces
```
