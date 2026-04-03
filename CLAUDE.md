# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orchestrator is a TypeScript CLI tool and HTTP server that scans a portfolio of GitHub projects, analyzes Git activity/momentum, and delivers AI-powered briefings via Telegram. Built on **Bun** runtime with zero external npm dependencies.

## Commands

```bash
# Run
bun run status          # Show project status table
bun run briefing        # Generate output/BRIEFING.md
bun run sync            # Generate briefing + output/registry.json
bun run notify          # Sync + send AI briefing via Telegram
bun run server          # HTTP server on port 3000
bun run cron            # Full scan cycle with Telegram notification
bun run poll            # Poll for Telegram commands
bun run setup-webhook   # Register Telegram webhook

# Test
bun test                # Run all tests
bun test alerts.test    # Run a single test file

# Update project status
bun run update "ProjectName" "status message"
```

No build step needed — Bun runs TypeScript directly.

## Architecture

**Data flow:** `orchestrator.config.ts` → `scanAll()` → `computeScores()` → `ProjectReport[]` → briefing/registry/Telegram

Key layers in `src/`:

- **Config & Types**: `config.ts` loads `orchestrator.config.ts` (user-defined project portfolio). `types.ts` defines all interfaces.
- **Scanning**: `scanner.ts` — fetches Git history, issues, and CLAUDE.md from GitHub API. No local repos needed.
- **Analysis**: `momentum.ts` (streak/trend detection), `alerts.ts` (rule-based alerts), `scoring.ts` (weighted prioritization: priority 35%, momentum 30%, impact 20%, engagement 15%), `health.ts` (status emoji).
- **Output**: `briefing.ts` (markdown + JSON registry), `ai-briefing.ts` (Claude Haiku generates Telegram-formatted briefing using `prompts/briefing.md` as system prompt).
- **Integration**: `telegram.ts` (bot API), `webhook.ts` (Telegram command handler), `server.ts` (HTTP endpoints), `status-notes.ts` (persistent notes in `output/status-notes.json`).
- **Entry points**: `cli.ts` (CLI command routing), `server.ts` (HTTP), `cron.ts` (scheduled execution).

## Key Conventions

- **Bun runtime** — uses `bun:test` for testing, native `fetch()` for HTTP, no node_modules required
- **ES modules** with TypeScript strict mode
- **All I/O is async** — async/await throughout
- **GitHub API for all scanning** — projects are configured by repo, not local paths
- **Environment variables**: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- **Generated artifacts** go in `output/` (gitignored)
- Deployed on **Railway** via Dockerfile (oven/bun:1-alpine)
