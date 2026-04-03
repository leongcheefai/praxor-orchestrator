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
    lost: "momentum lost \u2014 needs intervention",
    cooling: "cooling off",
    steady: "steady momentum",
    building: "building momentum \u2014 on track",
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
