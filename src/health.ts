import type { ProjectReport, HealthStatus } from "./types";

export function computeHealth(report: Pick<ProjectReport, "config" | "git">): HealthStatus {
  if (report.config.status === "parked") return "\u26AA";
  if (!report.git.hasGit) return "\u2753";
  if (report.git.daysSinceLastCommit <= 2) return "\u{1F7E2}";
  if (report.git.daysSinceLastCommit <= 7) return "\u{1F7E1}";
  return "\u{1F534}";
}
