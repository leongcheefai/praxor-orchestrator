import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { expandPath } from "./config";
import type { ProjectConfig, GitInfo, ClaudeMdInfo } from "./types";

export async function scanGit(project: ProjectConfig): Promise<GitInfo> {
  const dir = expandPath(project.path);

  if (!existsSync(join(dir, ".git"))) {
    return {
      lastCommitDate: null,
      lastCommitMessage: "",
      daysSinceLastCommit: Infinity,
      currentBranch: "",
      uncommittedChanges: false,
      hasGit: false,
    };
  }

  const [dateResult, msgResult, branchResult, statusResult] = await Promise.all([
    $`git -C ${dir} log -1 --format=%aI`.quiet().text(),
    $`git -C ${dir} log -1 --format=%s`.quiet().text(),
    $`git -C ${dir} rev-parse --abbrev-ref HEAD`.quiet().text(),
    $`git -C ${dir} status --porcelain`.quiet().text(),
  ]);

  const lastCommitDate = new Date(dateResult.trim());
  const now = new Date();
  const daysSince = Math.floor(
    (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    lastCommitDate,
    lastCommitMessage: msgResult.trim(),
    daysSinceLastCommit: daysSince,
    currentBranch: branchResult.trim(),
    uncommittedChanges: statusResult.trim().length > 0,
    hasGit: true,
  };
}

export async function scanClaudeMd(project: ProjectConfig): Promise<ClaudeMdInfo> {
  const dir = expandPath(project.path);
  const claudePath = join(dir, "CLAUDE.md");

  if (!existsSync(claudePath)) {
    return { exists: false, currentGoal: null, inProgress: [], knownIssues: [] };
  }

  const content = await Bun.file(claudePath).text();
  const lines = content.split("\n");

  let currentGoal: string | null = null;
  const inProgress: string[] = [];
  const knownIssues: string[] = [];

  let section: "none" | "in-progress" | "known-issues" = "none";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("**Current goal:**")) {
      currentGoal = trimmed.replace("**Current goal:**", "").trim();
      section = "none";
      continue;
    }

    if (trimmed.includes("**In progress:**")) {
      section = "in-progress";
      continue;
    }

    if (trimmed.includes("**Known issues:**")) {
      section = "known-issues";
      continue;
    }

    if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      section = "none";
      continue;
    }

    if (section === "in-progress" && /^- \[.\]/.test(trimmed)) {
      inProgress.push(trimmed.replace(/^- \[.\]\s*/, ""));
    }

    if (section === "known-issues" && trimmed.startsWith("- ")) {
      knownIssues.push(trimmed.replace(/^- /, ""));
    }
  }

  return { exists: true, currentGoal, inProgress, knownIssues };
}
