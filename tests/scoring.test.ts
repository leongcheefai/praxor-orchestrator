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
