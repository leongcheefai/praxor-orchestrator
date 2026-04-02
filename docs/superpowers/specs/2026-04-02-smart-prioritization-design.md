# Smart Prioritization System

**Date:** 2026-04-02
**Status:** Approved

## Problem

The orchestrator's Daily Focus currently recommends the most recently active project. This is naive — it doesn't account for priority, momentum loss, or impact. The user needs a ranked recommendation with reasoning to decide "what should I work on today?"

## Solution: Hybrid Score + Alert System

Combine a **scoring engine** (for ranked recommendations) with **rule-based alerts** (for flagging specific situations). Each serves a distinct purpose: scores determine order, rules determine what gets called out.

---

## 1. Config Changes

### Add `priority` to `ProjectConfig`

```ts
// In types.ts
export interface ProjectConfig {
  // ... existing fields
  priority?: "high" | "medium" | "low"; // defaults to "medium"
}
```

Each project in `orchestrator.config.ts` gets a `priority` field. Omitting it defaults to `"medium"`.

---

## 2. Momentum Tracking

### New module: `src/momentum.ts`

Computes momentum data from commit history. Requires increasing the commit fetch depth in `scanner.ts` from `per_page=5` to `per_page=30` to cover a 14-day window.

### Types

```ts
export interface MomentumData {
  streak: number;              // consecutive days with commits
  daysSinceLastCommit: number; // derived from git data
  lastSessionCommits: number;  // commits on most recent active day
  lastSessionDuration: string; // e.g., "2.5 hours"
  lastSessionDate: string;     // ISO date of last session
  trend: "building" | "steady" | "cooling" | "lost";
}
```

### Trend thresholds

| Trend | Condition |
|-------|-----------|
| `building` | streak >= 3 days |
| `steady` | last commit within 2 days |
| `cooling` | 3-7 days since last commit |
| `lost` | >7 days since last commit |

### Session detection

Group commits by calendar date. For each day:
- Count commits
- Estimate duration from first-to-last commit timestamp gap
- If only 1 commit on a day, duration = "single commit"

### Streak calculation

Count consecutive calendar days (going backward from today) that have at least 1 commit.

---

## 3. Scoring Engine

### New module: `src/scoring.ts`

Computes a 0-1 priority score per project.

### Score formula

| Factor | Weight | Values |
|--------|--------|--------|
| Config priority | 40% | high=1.0, medium=0.6, low=0.3 |
| Momentum need | 35% | lost=1.0, cooling=0.8, steady=0.3, building=0.2 |
| Impact signals | 25% | Normalized open issue count from GitHub API. Bugs (labeled "bug") weighted 2x. |

**Score = (priority * 0.4) + (momentum_need * 0.35) + (impact * 0.25)**

### GitHub Issues integration

Fetch open issue count per repo via GitHub API (`GET /repos/{owner}/{repo}/issues?state=open&per_page=100`). Count total and count those with label "bug" separately.

### Types

```ts
export interface ProjectScore {
  project: string;
  score: number;           // 0-1, higher = work on this
  reasoning: string;       // human-readable explanation
  factors: {
    priority: number;      // raw factor value (0-1)
    momentum: number;      // raw factor value (0-1)
    impact: number;        // raw factor value (0-1)
  };
}
```

### Impact normalization

Normalize issue count across all projects: `impact = project_issues / max_issues_across_all`. If no project has issues, impact = 0 for all. Bug-labeled issues count as 2 when computing the numerator.

---

## 4. Alert Rules

### New module: `src/alerts.ts`

Rule-based alerts that flag specific situations independent of scoring.

### Rules

| Rule | Condition | Severity | Message template |
|------|-----------|----------|------------------|
| Priority drift | priority=high AND trend=lost | critical | "{name} is high priority but hasn't been touched in {days} days" |
| Stale with issues | open issues > 0 AND trend in [cooling, lost] | warning | "{name} has {n} open issues and is going cold" |
| Long streak | streak >= 5 | info | "You've been on {name} for {streak} days straight - other projects may need a check-in" |
| Neglected client | type=client AND trend in [cooling, lost] | warning | "{name} is a client project cooling off - check if anything's blocked" |

### Types

```ts
export interface Alert {
  project: string;
  severity: "critical" | "warning" | "info";
  message: string;
}
```

Alerts sorted by severity: critical first, then warning, then info.

---

## 5. Updated Briefing Output

### BRIEFING.md structure

```markdown
# Morning Briefing - 2026-04-02

## Attention Needed
- [critical] offero is high priority but hasn't been touched in 10 days
- [warning] viaticus is a client project cooling off

## Today's Focus (Ranked)
1. **offero** (score: 0.87) - High priority, momentum lost - needs intervention
2. **praxor** (score: 0.72) - High priority, cooling, 3 open issues
3. **viaticus** (score: 0.65) - Medium priority, client project cooling
4. **onz-webapp** (score: 0.41) - Medium priority, steady momentum
5. **vanta - team hub** (score: 0.38) - Low priority, building momentum
6. **vanta - workshop** (score: 0.21) - Low priority, stale

## Momentum
| Project | Streak | Last Session | Trend |
|---------|--------|-------------|-------|
| offero | 0 days | 3 commits, 1.5h (Mar 23) | lost |
| onz-webapp | 2 days | 7 commits, 3h (yesterday) | steady |
...

## Active Projects
(existing detailed breakdown - unchanged)

## Parked Projects
(existing - unchanged)
```

The old "Daily Focus" section (single pick based on recency) is replaced by the new "Today's Focus (Ranked)" section.

### Telegram output

Condensed version: Alerts + top 3 ranked picks + momentum summary. Stays within Telegram's 4096 char message limit.

### registry.json additions

Each project entry gains:

```json
{
  "score": 0.87,
  "momentum": {
    "streak": 0,
    "daysSinceLastCommit": 10,
    "lastSessionCommits": 3,
    "lastSessionDuration": "1.5 hours",
    "lastSessionDate": "2026-03-23",
    "trend": "lost"
  },
  "alerts": ["offero is high priority but hasn't been touched in 10 days"],
  "priority": "high",
  "openIssues": { "total": 5, "bugs": 2 }
}
```

---

## 6. Scanner Changes

### Increased commit depth

Change `per_page=5` to `per_page=30` in `scanner.ts` to provide enough history for momentum tracking (14-day window).

### New function: `scanIssues(project: ProjectConfig)`

Fetch open issues via GitHub API. Returns `{ total: number, bugs: number }`.

```ts
export interface IssueInfo {
  total: number;
  bugs: number;
}
```

### Updated `ProjectReport`

```ts
export interface ProjectReport {
  config: ProjectConfig;
  git: GitInfo;
  claudeMd: ClaudeMdInfo;
  health: HealthStatus;
  momentum: MomentumData;   // new
  issues: IssueInfo;         // new
  score?: ProjectScore;      // new, populated after scoring
  alerts: Alert[];           // new, populated after alert evaluation
}
```

---

## 7. Files Changed / Created

| File | Action | Purpose |
|------|--------|---------|
| `src/types.ts` | Modified | Add priority, MomentumData, IssueInfo, ProjectScore, Alert types |
| `src/momentum.ts` | New | Momentum computation from commit history |
| `src/scoring.ts` | New | Score calculation per project |
| `src/alerts.ts` | New | Rule-based alert evaluation |
| `src/scanner.ts` | Modified | Increase per_page to 30, add scanIssues function |
| `src/briefing.ts` | Modified | New briefing sections (Attention Needed, Today's Focus, Momentum table) |
| `src/telegram.ts` | Modified | Updated formatting for new sections |
| `orchestrator.config.ts` | Modified | Add priority field to projects |

---

## 8. Non-Goals

- No external project management integrations (Linear, Notion, etc.)
- No historical trend storage — momentum is computed fresh each sync from commit history
- No UI beyond terminal/Telegram/markdown
- No changes to server endpoints (they continue serving the updated briefing/registry)
