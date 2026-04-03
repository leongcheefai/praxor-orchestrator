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
