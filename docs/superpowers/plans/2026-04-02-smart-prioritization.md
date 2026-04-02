# Smart Prioritization System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the naive "most recent = focus" recommendation with a hybrid score + alert system that ranks projects by priority, momentum, and impact.

**Architecture:** Three new modules (`momentum.ts`, `scoring.ts`, `alerts.ts`) compute data that feeds into the existing briefing and telegram pipelines. The scanner gains issue-fetching and deeper commit history. The briefing output gets three new sections: Attention Needed, Today's Focus (Ranked), and Momentum table.

**Tech Stack:** TypeScript, Bun (runtime + test runner), GitHub REST API

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `priority`, `MomentumData`, `IssueInfo`, `ProjectScore`, `Alert`, update `ProjectReport` |
| `src/momentum.ts` | Create | Compute streak, session data, and trend from commit history |
| `src/scoring.ts` | Create | Compute weighted priority score per project |
| `src/alerts.ts` | Create | Evaluate rule-based alerts per project |
| `src/scanner.ts` | Modify | Increase commit depth to 30, add `scanIssues()` |
| `src/briefing.ts` | Modify | New sections: Attention Needed, Today's Focus, Momentum table |
| `src/telegram.ts` | Modify | Updated formatting for alerts + ranked focus + momentum |
| `src/cli.ts` | Modify | Wire momentum, issues, scoring, and alerts into `scanAll()` pipeline |
| `orchestrator.config.ts` | Modify | Add `priority` field to each project |
| `tests/momentum.test.ts` | Create | Tests for momentum computation |
| `tests/scoring.test.ts` | Create | Tests for scoring engine |
| `tests/alerts.test.ts` | Create | Tests for alert rules |

---

### Task 1: Add New Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the new types and update existing interfaces**

Add `priority` to `ProjectConfig`, and add the new interfaces for momentum, issues, scoring, and alerts. Update `ProjectReport` to include the new fields.

```ts
// In src/types.ts — add priority to ProjectConfig
export interface ProjectConfig {
  name: string;
  repo: string;
  branch: string;
  type: "saas" | "client" | "micro-tool";
  platform: "web" | "ios" | "both";
  status: "active" | "parked";
  description: string;
  priority?: "high" | "medium" | "low";
  clientName?: string;
  budget?: { total: number; invoiced: number; currency: string };
  parkedReason?: string;
  reactivateWhen?: string;
}

// Add these new interfaces after ClaudeMdInfo:

export type MomentumTrend = "building" | "steady" | "cooling" | "lost";

export interface MomentumData {
  streak: number;
  daysSinceLastCommit: number;
  lastSessionCommits: number;
  lastSessionDuration: string;
  lastSessionDate: string;
  trend: MomentumTrend;
}

export interface IssueInfo {
  total: number;
  bugs: number;
}

export interface ProjectScore {
  project: string;
  score: number;
  reasoning: string;
  factors: {
    priority: number;
    momentum: number;
    impact: number;
  };
}

export interface Alert {
  project: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

// Update ProjectReport to include new fields:
export interface ProjectReport {
  config: ProjectConfig;
  git: GitInfo;
  claudeMd: ClaudeMdInfo;
  health: HealthStatus;
  momentum: MomentumData;
  issues: IssueInfo;
  score?: ProjectScore;
  alerts: Alert[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add types for momentum, scoring, alerts, and issues"
```

---

### Task 2: Momentum Module (TDD)

**Files:**
- Create: `src/momentum.ts`
- Create: `tests/momentum.test.ts`

- [ ] **Step 1: Write failing tests for momentum computation**

```ts
// tests/momentum.test.ts
import { describe, test, expect } from "bun:test";
import { computeMomentum } from "../src/momentum";
import type { GitInfo } from "../src/types";

function makeCommit(daysAgo: number, hour: number = 12): { hash: string; date: string; message: string } {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { hash: "abc1234", date: d.toISOString(), message: "test commit" };
}

function makeGitInfo(commits: { hash: string; date: string; message: string }[]): GitInfo {
  const lastCommitDate = commits.length > 0 ? new Date(commits[0].date) : null;
  const daysSince = lastCommitDate
    ? Math.floor((Date.now() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;
  return {
    lastCommitDate,
    lastCommitMessage: commits[0]?.message ?? "",
    daysSinceLastCommit: daysSince,
    currentBranch: "main",
    uncommittedChanges: false,
    hasGit: commits.length > 0,
    recentCommits: commits,
  };
}

describe("computeMomentum", () => {
  test("returns lost trend when no commits", () => {
    const git = makeGitInfo([]);
    const result = computeMomentum(git);
    expect(result.trend).toBe("lost");
    expect(result.streak).toBe(0);
  });

  test("returns building trend with 3+ day streak", () => {
    const commits = [
      makeCommit(0, 14),
      makeCommit(0, 10),
      makeCommit(1, 15),
      makeCommit(2, 12),
      makeCommit(3, 9),
    ];
    const git = makeGitInfo(commits);
    const result = computeMomentum(git);
    expect(result.trend).toBe("building");
    expect(result.streak).toBeGreaterThanOrEqual(3);
  });

  test("returns steady trend when last commit within 2 days", () => {
    const commits = [makeCommit(1, 10)];
    const git = makeGitInfo(commits);
    const result = computeMomentum(git);
    expect(result.trend).toBe("steady");
  });

  test("returns cooling trend for 3-7 days since last commit", () => {
    const commits = [makeCommit(5, 10)];
    const git = makeGitInfo(commits);
    const result = computeMomentum(git);
    expect(result.trend).toBe("cooling");
  });

  test("returns lost trend for >7 days since last commit", () => {
    const commits = [makeCommit(10, 10)];
    const git = makeGitInfo(commits);
    const result = computeMomentum(git);
    expect(result.trend).toBe("lost");
  });

  test("computes session info from commits on the same day", () => {
    const commits = [
      makeCommit(0, 16),
      makeCommit(0, 14),
      makeCommit(0, 12),
    ];
    const git = makeGitInfo(commits);
    const result = computeMomentum(git);
    expect(result.lastSessionCommits).toBe(3);
    expect(result.lastSessionDate).toBe(new Date().toISOString().split("T")[0]);
  });

  test("single commit session shows 'single commit' duration", () => {
    const commits = [makeCommit(0, 10)];
    const git = makeGitInfo(commits);
    const result = computeMomentum(git);
    expect(result.lastSessionCommits).toBe(1);
    expect(result.lastSessionDuration).toBe("single commit");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/momentum.test.ts`
Expected: FAIL — `computeMomentum` not found

- [ ] **Step 3: Implement momentum module**

```ts
// src/momentum.ts
import type { GitInfo, MomentumData, MomentumTrend } from "./types";

export function computeMomentum(git: GitInfo): MomentumData {
  if (!git.hasGit || git.recentCommits.length === 0) {
    return {
      streak: 0,
      daysSinceLastCommit: git.daysSinceLastCommit === Infinity ? -1 : git.daysSinceLastCommit,
      lastSessionCommits: 0,
      lastSessionDuration: "no activity",
      lastSessionDate: "never",
      trend: "lost",
    };
  }

  const commitsByDay = groupCommitsByDay(git.recentCommits);
  const streak = computeStreak(commitsByDay);
  const lastSession = getLastSession(commitsByDay);
  const trend = computeTrend(streak, git.daysSinceLastCommit);

  return {
    streak,
    daysSinceLastCommit: git.daysSinceLastCommit,
    lastSessionCommits: lastSession.commits,
    lastSessionDuration: lastSession.duration,
    lastSessionDate: lastSession.date,
    trend,
  };
}

function groupCommitsByDay(
  commits: { hash: string; date: string; message: string }[]
): Map<string, Date[]> {
  const byDay = new Map<string, Date[]>();
  for (const c of commits) {
    const d = new Date(c.date);
    const key = d.toISOString().split("T")[0];
    const existing = byDay.get(key) ?? [];
    existing.push(d);
    byDay.set(key, existing);
  }
  return byDay;
}

function computeStreak(commitsByDay: Map<string, Date[]>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let checkDate = new Date(today);

  // If no commits today, start checking from yesterday
  const todayKey = checkDate.toISOString().split("T")[0];
  if (!commitsByDay.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (let i = 0; i < 30; i++) {
    const key = checkDate.toISOString().split("T")[0];
    if (commitsByDay.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function getLastSession(commitsByDay: Map<string, Date[]>): {
  commits: number;
  duration: string;
  date: string;
} {
  // Get most recent day with commits
  const sortedDays = [...commitsByDay.keys()].sort().reverse();
  if (sortedDays.length === 0) {
    return { commits: 0, duration: "no activity", date: "never" };
  }

  const latestDay = sortedDays[0];
  const timestamps = commitsByDay.get(latestDay)!;
  const commits = timestamps.length;

  if (commits === 1) {
    return { commits: 1, duration: "single commit", date: latestDay };
  }

  const sorted = timestamps.map((d) => d.getTime()).sort((a, b) => a - b);
  const diffMs = sorted[sorted.length - 1] - sorted[0];
  const diffHours = diffMs / (1000 * 60 * 60);
  const duration =
    diffHours < 0.1
      ? "single commit"
      : `${diffHours.toFixed(1)} hours`;

  return { commits, duration, date: latestDay };
}

function computeTrend(streak: number, daysSinceLastCommit: number): MomentumTrend {
  if (daysSinceLastCommit > 7) return "lost";
  if (daysSinceLastCommit > 2) return "cooling";
  if (streak >= 3) return "building";
  return "steady";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/momentum.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/momentum.ts tests/momentum.test.ts
git commit -m "feat: add momentum tracking module with tests"
```

---

### Task 3: Scoring Engine (TDD)

**Files:**
- Create: `src/scoring.ts`
- Create: `tests/scoring.test.ts`

- [ ] **Step 1: Write failing tests for scoring engine**

```ts
// tests/scoring.test.ts
import { describe, test, expect } from "bun:test";
import { computeScores } from "../src/scoring";
import type { ProjectReport, MomentumData, IssueInfo } from "../src/types";

function makeReport(overrides: {
  name: string;
  priority?: "high" | "medium" | "low";
  trend?: MomentumData["trend"];
  issues?: IssueInfo;
}): ProjectReport {
  return {
    config: {
      name: overrides.name,
      repo: "owner/repo",
      branch: "main",
      type: "saas",
      platform: "web",
      status: "active",
      description: "test",
      priority: overrides.priority ?? "medium",
    },
    git: {
      lastCommitDate: new Date(),
      lastCommitMessage: "test",
      daysSinceLastCommit: 0,
      currentBranch: "main",
      uncommittedChanges: false,
      hasGit: true,
      recentCommits: [],
    },
    claudeMd: { exists: false, currentGoal: null, inProgress: [], knownIssues: [] },
    health: "\u{1F7E2}",
    momentum: {
      streak: 0,
      daysSinceLastCommit: 0,
      lastSessionCommits: 0,
      lastSessionDuration: "no activity",
      lastSessionDate: "never",
      trend: overrides.trend ?? "steady",
    },
    issues: overrides.issues ?? { total: 0, bugs: 0 },
    alerts: [],
  };
}

describe("computeScores", () => {
  test("high priority + lost momentum scores higher than low priority + building", () => {
    const reports = [
      makeReport({ name: "a", priority: "high", trend: "lost" }),
      makeReport({ name: "b", priority: "low", trend: "building" }),
    ];
    const scores = computeScores(reports);
    const scoreA = scores.find((s) => s.project === "a")!;
    const scoreB = scores.find((s) => s.project === "b")!;
    expect(scoreA.score).toBeGreaterThan(scoreB.score);
  });

  test("projects with more issues score higher (impact factor)", () => {
    const reports = [
      makeReport({ name: "a", issues: { total: 10, bugs: 3 } }),
      makeReport({ name: "b", issues: { total: 0, bugs: 0 } }),
    ];
    const scores = computeScores(reports);
    const scoreA = scores.find((s) => s.project === "a")!;
    const scoreB = scores.find((s) => s.project === "b")!;
    expect(scoreA.factors.impact).toBeGreaterThan(scoreB.factors.impact);
  });

  test("scores are between 0 and 1", () => {
    const reports = [
      makeReport({ name: "a", priority: "high", trend: "lost", issues: { total: 20, bugs: 10 } }),
      makeReport({ name: "b", priority: "low", trend: "building", issues: { total: 0, bugs: 0 } }),
    ];
    const scores = computeScores(reports);
    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  test("returns scores sorted descending", () => {
    const reports = [
      makeReport({ name: "low", priority: "low", trend: "building" }),
      makeReport({ name: "high", priority: "high", trend: "lost" }),
    ];
    const scores = computeScores(reports);
    expect(scores[0].project).toBe("high");
  });

  test("reasoning includes priority and momentum info", () => {
    const reports = [
      makeReport({ name: "a", priority: "high", trend: "lost" }),
    ];
    const scores = computeScores(reports);
    expect(scores[0].reasoning.toLowerCase()).toContain("high");
    expect(scores[0].reasoning.toLowerCase()).toContain("lost");
  });

  test("defaults to medium priority when omitted", () => {
    const reports = [
      makeReport({ name: "a", priority: undefined, trend: "steady" }),
    ];
    const scores = computeScores(reports);
    expect(scores[0].factors.priority).toBeCloseTo(0.6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/scoring.test.ts`
Expected: FAIL — `computeScores` not found

- [ ] **Step 3: Implement scoring engine**

```ts
// src/scoring.ts
import type { ProjectReport, ProjectScore, MomentumTrend } from "./types";

const PRIORITY_WEIGHTS: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

const MOMENTUM_NEED: Record<MomentumTrend, number> = {
  lost: 1.0,
  cooling: 0.8,
  steady: 0.3,
  building: 0.2,
};

export function computeScores(reports: ProjectReport[]): ProjectScore[] {
  const activeReports = reports.filter((r) => r.config.status === "active");

  // Find max weighted issues for normalization
  const maxIssues = Math.max(
    ...activeReports.map((r) => r.issues.total + r.issues.bugs),
    1 // avoid division by zero
  );

  const scores: ProjectScore[] = activeReports.map((r) => {
    const priority = PRIORITY_WEIGHTS[r.config.priority ?? "medium"];
    const momentum = MOMENTUM_NEED[r.momentum.trend];
    const weightedIssues = r.issues.total + r.issues.bugs; // bugs counted twice (once in total, once extra)
    const impact = weightedIssues / maxIssues;

    const score = priority * 0.4 + momentum * 0.35 + impact * 0.25;

    const reasoning = buildReasoning(r, { priority, momentum, impact });

    return {
      project: r.config.name,
      score: Math.round(score * 100) / 100,
      reasoning,
      factors: {
        priority,
        momentum,
        impact: Math.round(impact * 100) / 100,
      },
    };
  });

  return scores.sort((a, b) => b.score - a.score);
}

function buildReasoning(
  report: ProjectReport,
  factors: { priority: number; momentum: number; impact: number }
): string {
  const parts: string[] = [];

  const priorityLabel = report.config.priority ?? "medium";
  parts.push(`${capitalize(priorityLabel)} priority`);

  const trendLabels: Record<MomentumTrend, string> = {
    lost: "momentum lost — needs intervention",
    cooling: "cooling off",
    steady: "steady momentum",
    building: "building momentum — on track",
  };
  parts.push(trendLabels[report.momentum.trend]);

  if (report.issues.total > 0) {
    const bugNote = report.issues.bugs > 0 ? ` (${report.issues.bugs} bugs)` : "";
    parts.push(`${report.issues.total} open issues${bugNote}`);
  }

  return parts.join(", ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/scoring.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scoring.ts tests/scoring.test.ts
git commit -m "feat: add scoring engine with weighted priority calculation"
```

---

### Task 4: Alert Rules (TDD)

**Files:**
- Create: `src/alerts.ts`
- Create: `tests/alerts.test.ts`

- [ ] **Step 1: Write failing tests for alerts**

```ts
// tests/alerts.test.ts
import { describe, test, expect } from "bun:test";
import { evaluateAlerts } from "../src/alerts";
import type { ProjectReport } from "../src/types";

function makeReport(overrides: {
  name: string;
  priority?: "high" | "medium" | "low";
  type?: "saas" | "client" | "micro-tool";
  trend?: "building" | "steady" | "cooling" | "lost";
  streak?: number;
  daysSinceLastCommit?: number;
  issues?: { total: number; bugs: number };
}): ProjectReport {
  return {
    config: {
      name: overrides.name,
      repo: "owner/repo",
      branch: "main",
      type: overrides.type ?? "saas",
      platform: "web",
      status: "active",
      description: "test",
      priority: overrides.priority ?? "medium",
    },
    git: {
      lastCommitDate: new Date(),
      lastCommitMessage: "test",
      daysSinceLastCommit: overrides.daysSinceLastCommit ?? 0,
      currentBranch: "main",
      uncommittedChanges: false,
      hasGit: true,
      recentCommits: [],
    },
    claudeMd: { exists: false, currentGoal: null, inProgress: [], knownIssues: [] },
    health: "\u{1F7E2}",
    momentum: {
      streak: overrides.streak ?? 0,
      daysSinceLastCommit: overrides.daysSinceLastCommit ?? 0,
      lastSessionCommits: 0,
      lastSessionDuration: "no activity",
      lastSessionDate: "never",
      trend: overrides.trend ?? "steady",
    },
    issues: overrides.issues ?? { total: 0, bugs: 0 },
    alerts: [],
  };
}

describe("evaluateAlerts", () => {
  test("critical alert for high priority + lost momentum", () => {
    const report = makeReport({ name: "offero", priority: "high", trend: "lost", daysSinceLastCommit: 10 });
    const alerts = evaluateAlerts(report);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].message).toContain("offero");
    expect(alerts[0].message).toContain("10");
  });

  test("warning alert for stale project with open issues", () => {
    const report = makeReport({ name: "praxor", trend: "cooling", issues: { total: 3, bugs: 1 } });
    const alerts = evaluateAlerts(report);
    expect(alerts.some((a) => a.severity === "warning" && a.message.includes("3 open issues"))).toBe(true);
  });

  test("info alert for long streak (>=5 days)", () => {
    const report = makeReport({ name: "offero", streak: 5, trend: "building" });
    const alerts = evaluateAlerts(report);
    expect(alerts.some((a) => a.severity === "info" && a.message.includes("5 days"))).toBe(true);
  });

  test("warning alert for neglected client project", () => {
    const report = makeReport({ name: "viaticus", type: "client", trend: "cooling" });
    const alerts = evaluateAlerts(report);
    expect(alerts.some((a) => a.severity === "warning" && a.message.includes("client project"))).toBe(true);
  });

  test("no alerts for steady medium-priority project", () => {
    const report = makeReport({ name: "boring", trend: "steady" });
    const alerts = evaluateAlerts(report);
    expect(alerts).toHaveLength(0);
  });

  test("alerts sorted by severity: critical > warning > info", () => {
    const report = makeReport({
      name: "offero",
      priority: "high",
      type: "client",
      trend: "lost",
      streak: 6,
      daysSinceLastCommit: 10,
      issues: { total: 5, bugs: 2 },
    });
    const alerts = evaluateAlerts(report);
    const severities = alerts.map((a) => a.severity);
    const order = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]]);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/alerts.test.ts`
Expected: FAIL — `evaluateAlerts` not found

- [ ] **Step 3: Implement alert rules**

```ts
// src/alerts.ts
import type { ProjectReport, Alert } from "./types";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export function evaluateAlerts(report: ProjectReport): Alert[] {
  const alerts: Alert[] = [];
  const name = report.config.name;
  const trend = report.momentum.trend;
  const priority = report.config.priority ?? "medium";

  // Rule 1: Priority drift — high priority + lost momentum
  if (priority === "high" && trend === "lost") {
    alerts.push({
      project: name,
      severity: "critical",
      message: `${name} is high priority but hasn't been touched in ${report.momentum.daysSinceLastCommit} days`,
    });
  }

  // Rule 2: Stale with issues — open issues + cooling/lost
  if (report.issues.total > 0 && (trend === "cooling" || trend === "lost")) {
    alerts.push({
      project: name,
      severity: "warning",
      message: `${name} has ${report.issues.total} open issues and is going cold`,
    });
  }

  // Rule 3: Long streak — streak >= 5 days
  if (report.momentum.streak >= 5) {
    alerts.push({
      project: name,
      severity: "info",
      message: `You've been on ${name} for ${report.momentum.streak} days straight — other projects may need a check-in`,
    });
  }

  // Rule 4: Neglected client — client type + cooling/lost
  if (report.config.type === "client" && (trend === "cooling" || trend === "lost")) {
    alerts.push({
      project: name,
      severity: "warning",
      message: `${name} is a client project cooling off — check if anything's blocked`,
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/alerts.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/alerts.ts tests/alerts.test.ts
git commit -m "feat: add rule-based alert system with 4 alert rules"
```

---

### Task 5: Scanner — Increase Commit Depth + Add Issue Scanning

**Files:**
- Modify: `src/scanner.ts:45` (change per_page from 5 to 30)
- Add: `scanIssues()` function in `src/scanner.ts`

- [ ] **Step 1: Increase commit fetch depth**

In `src/scanner.ts`, change line 45:

```ts
// Old:
const url = `${GITHUB_API}/repos/${project.repo}/commits?sha=${branch}&per_page=5`;

// New:
const url = `${GITHUB_API}/repos/${project.repo}/commits?sha=${branch}&per_page=30`;
```

- [ ] **Step 2: Add scanIssues function**

Add at the end of `src/scanner.ts`, before the `noGitInfo()` function:

```ts
export async function scanIssues(project: ProjectConfig): Promise<IssueInfo> {
  try {
    const url = `${GITHUB_API}/repos/${project.repo}/issues?state=open&per_page=100`;
    const res = await fetch(url, { headers: getHeaders() });

    if (!res.ok) {
      console.warn(`Failed to fetch issues for ${project.repo} (${res.status})`);
      return { total: 0, bugs: 0 };
    }

    const issues = (await res.json()) as any[];
    // GitHub API returns PRs in issues endpoint — filter them out
    const realIssues = issues.filter((i: any) => !i.pull_request);
    const bugs = realIssues.filter((i: any) =>
      i.labels?.some((l: any) => l.name.toLowerCase() === "bug")
    );

    return { total: realIssues.length, bugs: bugs.length };
  } catch (err) {
    console.warn(`Failed to fetch issues for ${project.repo}:`, (err as Error).message);
    return { total: 0, bugs: 0 };
  }
}
```

- [ ] **Step 3: Add IssueInfo import to scanner.ts**

At the top of `src/scanner.ts`, update the import:

```ts
// Old:
import type { ProjectConfig, GitInfo, ClaudeMdInfo } from "./types";

// New:
import type { ProjectConfig, GitInfo, ClaudeMdInfo, IssueInfo } from "./types";
```

- [ ] **Step 4: Commit**

```bash
git add src/scanner.ts
git commit -m "feat: increase commit depth to 30 and add issue scanning"
```

---

### Task 6: Wire Everything Into the Pipeline

**Files:**
- Modify: `src/cli.ts`
- Modify: `orchestrator.config.ts`

- [ ] **Step 1: Update orchestrator.config.ts with priority fields**

```ts
// orchestrator.config.ts — add priority to each project:
{
  name: "offero",
  // ... existing fields
  priority: "high",
},
{
  name: "viaticus",
  // ... existing fields
  priority: "high",
},
{
  name: "praxor",
  // ... existing fields
  priority: "medium",
},
{
  name: "onz-webapp",
  // ... existing fields
  priority: "medium",
},
{
  name: "vanta - team hub",
  // ... existing fields
  priority: "low",
},
{
  name: "vanta - workshop management",
  // ... existing fields
  priority: "low",
},
```

- [ ] **Step 2: Update scanAll() in cli.ts to include momentum, issues, scoring, and alerts**

Update imports at the top of `src/cli.ts`:

```ts
import { loadConfig } from "./config";
import { scanGit, scanClaudeMd, scanIssues } from "./scanner";
import { computeHealth } from "./health";
import { printTable } from "./table";
import { generateBriefing, generateRegistry } from "./briefing";
import { sendTelegram, formatTelegramBriefing } from "./telegram";
import { computeMomentum } from "./momentum";
import { computeScores } from "./scoring";
import { evaluateAlerts } from "./alerts";
import type { ProjectReport } from "./types";
```

Update the `scanAll()` function:

```ts
export async function scanAll(): Promise<{ reports: ProjectReport[]; outputDir: string }> {
  const config = await loadConfig();
  const outputDir = expandPath(config.outputDir);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const reports: ProjectReport[] = await Promise.all(
    config.projects.map(async (project) => {
      const git = await scanGit(project);
      const claudeMd = await scanClaudeMd(project, git.currentBranch || undefined);
      const health = computeHealth({ config: project, git });
      const momentum = computeMomentum(git);
      const issues = await scanIssues(project);
      const alerts = evaluateAlerts({
        config: project,
        git,
        claudeMd,
        health,
        momentum,
        issues,
        alerts: [],
      });
      return { config: project, git, claudeMd, health, momentum, issues, alerts };
    })
  );

  // Compute scores across all reports and attach to each report
  const scores = computeScores(reports);
  for (const score of scores) {
    const report = reports.find((r) => r.config.name === score.project);
    if (report) report.score = score;
  }

  return { reports, outputDir };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts orchestrator.config.ts
git commit -m "feat: wire momentum, scoring, and alerts into scan pipeline"
```

---

### Task 7: Update Briefing Output

**Files:**
- Modify: `src/briefing.ts`

- [ ] **Step 1: Replace the Daily Focus section and add new sections**

Replace the entire `generateBriefing` function in `src/briefing.ts`:

```ts
export function generateBriefing(reports: ProjectReport[], config: OrchestratorConfig): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const lines: string[] = [];

  lines.push(`# Morning Briefing - ${dateStr}`);
  lines.push("");

  // Attention Needed (alerts)
  const allAlerts = reports.flatMap((r) => r.alerts);
  if (allAlerts.length > 0) {
    lines.push("## Attention Needed");
    lines.push("");
    const severityIcon = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
    for (const alert of allAlerts) {
      lines.push(`- ${severityIcon[alert.severity]} ${alert.message}`);
    }
    lines.push("");
  }

  // Today's Focus (Ranked)
  const scored = reports
    .filter((r) => r.score)
    .sort((a, b) => b.score!.score - a.score!.score);

  if (scored.length > 0) {
    lines.push("## Today's Focus (Ranked)");
    lines.push("");
    scored.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.config.name}** (score: ${r.score!.score.toFixed(2)}) — ${r.score!.reasoning}`);
    });
    lines.push("");
  }

  // Momentum table
  const active = reports.filter((r) => r.config.status === "active");
  if (active.length > 0) {
    const trendIcon = { building: "\u{1F7E2}", steady: "\u{1F7E1}", cooling: "\u{1F7E0}", lost: "\u{1F534}" };
    lines.push("## Momentum");
    lines.push("");
    lines.push("| Project | Streak | Last Session | Trend |");
    lines.push("|---------|--------|-------------|-------|");
    for (const r of active) {
      const session = r.momentum.lastSessionCommits > 0
        ? `${r.momentum.lastSessionCommits} commits, ${r.momentum.lastSessionDuration} (${r.momentum.lastSessionDate})`
        : "no activity";
      lines.push(`| ${r.config.name} | ${r.momentum.streak} days | ${session} | ${trendIcon[r.momentum.trend]} ${r.momentum.trend} |`);
    }
    lines.push("");
  }

  // Existing alerts (stale, uncommitted, missing CLAUDE.md)
  const stale = reports.filter(
    (r) => r.config.status === "active" && r.git.hasGit && r.git.daysSinceLastCommit > config.stalenessThresholdDays
  );
  const uncommitted = reports.filter(
    (r) => r.config.status === "active" && r.git.uncommittedChanges
  );
  const missingClaude = reports.filter(
    (r) => r.config.status === "active" && r.git.hasGit && !r.claudeMd.exists
  );

  if (stale.length > 0 || uncommitted.length > 0 || missingClaude.length > 0) {
    lines.push("## Alerts");
    lines.push("");
    for (const r of stale) {
      lines.push(`- \u{1F534} **${r.config.name}** is stale (${r.git.daysSinceLastCommit} days since last commit)`);
    }
    for (const r of uncommitted) {
      lines.push(`- \u{1F4E6} **${r.config.name}** has uncommitted changes on \`${r.git.currentBranch}\``);
    }
    for (const r of missingClaude) {
      lines.push(`- \u{1F4DD} **${r.config.name}** is missing CLAUDE.md`);
    }
    lines.push("");
  }

  // Active projects sorted by score (or recency as fallback)
  const activeSorted = [...active].sort((a, b) => {
    if (a.score && b.score) return b.score.score - a.score.score;
    if (!a.git.lastCommitDate) return 1;
    if (!b.git.lastCommitDate) return -1;
    return b.git.lastCommitDate.getTime() - a.git.lastCommitDate.getTime();
  });

  if (activeSorted.length > 0) {
    lines.push("## Active Projects");
    lines.push("");

    for (const r of activeSorted) {
      lines.push(`### ${r.health} ${r.config.name}`);
      lines.push("");
      lines.push(`> ${r.config.description}`);
      lines.push("");
      lines.push(`- **Type:** ${r.config.type} | **Platform:** ${r.config.platform} | **Priority:** ${r.config.priority ?? "medium"}`);
      if (r.config.clientName) {
        lines.push(`- **Client:** ${r.config.clientName}`);
      }
      if (r.config.budget) {
        const remaining = r.config.budget.total - r.config.budget.invoiced;
        lines.push(
          `- **Budget:** ${r.config.budget.currency} ${r.config.budget.invoiced.toLocaleString()} / ${r.config.budget.total.toLocaleString()} invoiced (${r.config.budget.currency} ${remaining.toLocaleString()} remaining)`
        );
      }
      if (r.git.hasGit) {
        lines.push(`- **Branch:** \`${r.git.currentBranch}\``);
        lines.push(`- **Last commit:** ${formatDate(r.git.lastCommitDate)} (${r.git.daysSinceLastCommit}d ago) - ${r.git.lastCommitMessage}`);
        if (r.git.uncommittedChanges) {
          lines.push(`- **\u26A0\uFE0F Uncommitted changes**`);
        }
      } else {
        lines.push(`- **\u2753 No git repository found**`);
      }
      if (r.claudeMd.exists) {
        if (r.claudeMd.currentGoal) {
          lines.push(`- **Goal:** ${r.claudeMd.currentGoal}`);
        }
        if (r.claudeMd.inProgress.length > 0) {
          lines.push(`- **In progress:**`);
          for (const item of r.claudeMd.inProgress) {
            lines.push(`  - [ ] ${item}`);
          }
        }
        if (r.claudeMd.knownIssues.length > 0) {
          lines.push(`- **Known issues:**`);
          for (const issue of r.claudeMd.knownIssues) {
            lines.push(`  - ${issue}`);
          }
        }
      }
      lines.push("");
    }
  }

  // Parked projects
  const parked = reports.filter((r) => r.config.status === "parked");
  if (parked.length > 0) {
    lines.push("## Parked Projects");
    lines.push("");
    for (const r of parked) {
      let line = `- **${r.config.name}** - ${r.config.description}`;
      if (r.config.parkedReason) line += ` _(${r.config.parkedReason})_`;
      if (r.config.reactivateWhen) line += ` \u2192 Reactivate: ${r.config.reactivateWhen}`;
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

Update the import at the top of `src/briefing.ts`:

```ts
// No import changes needed — already imports ProjectReport and OrchestratorConfig
```

- [ ] **Step 2: Update generateRegistry to include new fields**

Replace the `generateRegistry` function in `src/briefing.ts`:

```ts
export function generateRegistry(reports: ProjectReport[]): object {
  return {
    generatedAt: new Date().toISOString(),
    projects: reports.map((r) => ({
      name: r.config.name,
      repo: r.config.repo,
      branch: r.config.branch,
      type: r.config.type,
      platform: r.config.platform,
      status: r.config.status,
      description: r.config.description,
      priority: r.config.priority ?? "medium",
      health: r.health,
      git: {
        hasGit: r.git.hasGit,
        lastCommitDate: r.git.lastCommitDate?.toISOString() ?? null,
        lastCommitMessage: r.git.lastCommitMessage,
        daysSinceLastCommit: r.git.daysSinceLastCommit === Infinity ? null : r.git.daysSinceLastCommit,
        currentBranch: r.git.currentBranch,
        uncommittedChanges: r.git.uncommittedChanges,
      },
      claudeMd: {
        exists: r.claudeMd.exists,
        currentGoal: r.claudeMd.currentGoal,
        inProgress: r.claudeMd.inProgress,
        knownIssues: r.claudeMd.knownIssues,
      },
      momentum: {
        streak: r.momentum.streak,
        daysSinceLastCommit: r.momentum.daysSinceLastCommit,
        lastSessionCommits: r.momentum.lastSessionCommits,
        lastSessionDuration: r.momentum.lastSessionDuration,
        lastSessionDate: r.momentum.lastSessionDate,
        trend: r.momentum.trend,
      },
      issues: r.issues,
      score: r.score
        ? { score: r.score.score, reasoning: r.score.reasoning, factors: r.score.factors }
        : null,
      alerts: r.alerts.map((a) => a.message),
      ...(r.config.clientName && { clientName: r.config.clientName }),
      ...(r.config.budget && { budget: r.config.budget }),
      ...(r.config.parkedReason && { parkedReason: r.config.parkedReason }),
      ...(r.config.reactivateWhen && { reactivateWhen: r.config.reactivateWhen }),
    })),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/briefing.ts
git commit -m "feat: update briefing with ranked focus, momentum table, and alerts"
```

---

### Task 8: Update Telegram Formatting

**Files:**
- Modify: `src/telegram.ts`

- [ ] **Step 1: Replace formatTelegramBriefing with updated version**

Replace the `formatTelegramBriefing` function in `src/telegram.ts`:

```ts
export function formatTelegramBriefing(
  reports: ProjectReport[],
  config: OrchestratorConfig
): string {
  const lines: string[] = [];
  const now = new Date();

  lines.push(`*\u{1F50D} Morning Briefing*`);
  lines.push(`_${formatDate(now)}_`);
  lines.push("");

  // Attention Needed (alerts)
  const allAlerts = reports.flatMap((r) => r.alerts);
  if (allAlerts.length > 0) {
    lines.push("*\u26A0\uFE0F Attention Needed*");
    const severityIcon = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
    for (const alert of allAlerts) {
      lines.push(`${severityIcon[alert.severity]} ${escapeMd(alert.message)}`);
    }
    lines.push("");
  }

  // Today's Focus — top 3
  const scored = reports
    .filter((r) => r.score)
    .sort((a, b) => b.score!.score - a.score!.score)
    .slice(0, 3);

  if (scored.length > 0) {
    lines.push("*\u{1F3AF} Today's Focus*");
    scored.forEach((r, i) => {
      lines.push(`${i + 1}\\. *${escapeMd(r.config.name)}* \\(${r.score!.score.toFixed(2)}\\) — ${escapeMd(r.score!.reasoning)}`);
    });
    lines.push("");
  }

  // Momentum summary
  const active = reports.filter((r) => r.config.status === "active");
  if (active.length > 0) {
    const trendIcon = { building: "\u{1F7E2}", steady: "\u{1F7E1}", cooling: "\u{1F7E0}", lost: "\u{1F534}" };
    lines.push("*\u{1F4C8} Momentum*");
    for (const r of active) {
      const streak = r.momentum.streak > 0 ? `${r.momentum.streak}d streak` : "";
      const trend = `${trendIcon[r.momentum.trend]} ${r.momentum.trend}`;
      lines.push(`${trend} *${escapeMd(r.config.name)}* ${streak}`);
    }
    lines.push("");
  }

  // Parked projects
  const parked = reports.filter((r) => r.config.status === "parked");
  if (parked.length > 0) {
    lines.push("*\u{1F4A4} Parked*");
    for (const r of parked) {
      const reason = r.config.parkedReason
        ? ` — ${escapeMd(r.config.parkedReason)}`
        : "";
      lines.push(`\u26AA ${escapeMd(r.config.name)}${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/telegram.ts
git commit -m "feat: update telegram formatting with alerts, ranked focus, momentum"
```

---

### Task 9: Smoke Test — End to End

**Files:**
- None created or modified

- [ ] **Step 1: Run all unit tests**

Run: `bun test`
Expected: All tests pass (momentum, scoring, alerts)

- [ ] **Step 2: Run the CLI status command**

Run: `GITHUB_TOKEN=<token> bun run status`
Expected: Table renders without errors. No TypeScript compilation errors.

- [ ] **Step 3: Run the CLI briefing command**

Run: `GITHUB_TOKEN=<token> bun run briefing`
Expected: BRIEFING.md is generated with the new sections: "Attention Needed", "Today's Focus (Ranked)", "Momentum" table. Active projects section includes priority field.

- [ ] **Step 4: Verify registry.json includes new fields**

Run: `GITHUB_TOKEN=<token> bun run sync`
Then inspect `~/orchestrator/output/registry.json` — each project should have `momentum`, `issues`, `score`, `alerts`, and `priority` fields.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

Only run this if changes were made during smoke testing. Skip if everything passed cleanly.
