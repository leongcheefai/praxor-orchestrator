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
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]]);
    }
  });
});
