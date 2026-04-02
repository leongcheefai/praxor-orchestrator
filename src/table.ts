import type { ProjectReport } from "./types";

function pad(str: string, len: number): string {
  // Account for emoji width (most emoji are 2 chars wide in terminal)
  const emojiCount = (str.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{2BFF}\u{2753}]/gu) || []).length;
  const visualLen = str.length + emojiCount;
  if (visualLen >= len) return str;
  return str + " ".repeat(len - visualLen);
}

function formatDays(days: number, hasGit: boolean): string {
  if (!hasGit) return "no git";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function printTable(reports: ProjectReport[]): void {
  if (reports.length === 0) {
    console.log("No projects configured. Edit orchestrator.config.ts to add projects.");
    return;
  }

  const headers = ["", "Project", "Last Touched", "Branch", "Latest Action"];
  const rows = reports.map((r) => {
    let nextAction = "";
    if (r.config.status === "parked") {
      nextAction = r.config.reactivateWhen ? `Reactivate: ${r.config.reactivateWhen}` : "Parked";
    } else if (!r.git.hasGit) {
      nextAction = "Initialize git";
    } else if (r.git.uncommittedChanges) {
      nextAction = "Commit pending changes";
    } else if (!r.claudeMd.exists) {
      nextAction = "Add CLAUDE.md";
    } else if (r.claudeMd.currentGoal) {
      nextAction = r.claudeMd.currentGoal;
    } else if (r.claudeMd.inProgress.length > 0) {
      nextAction = r.claudeMd.inProgress[0];
    } else {
      nextAction = r.git.lastCommitMessage || "-";
    }

    if (nextAction.length > 50) nextAction = nextAction.slice(0, 47) + "...";

    return [
      r.health,
      r.config.name,
      formatDays(r.git.daysSinceLastCommit, r.git.hasGit),
      r.git.currentBranch || "-",
      nextAction,
    ];
  });

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)) + 2
  );

  const sep = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join(" | ");

  console.log(headerLine);
  console.log(sep);
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, colWidths[i])).join(" | "));
  }
}
