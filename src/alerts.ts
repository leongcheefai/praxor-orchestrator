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
      message: `You've been on ${name} for ${report.momentum.streak} days straight \u2014 other projects may need a check-in`,
    });
  }

  // Rule 4: Neglected client — client type + cooling/lost
  if (report.config.type === "client" && (trend === "cooling" || trend === "lost")) {
    alerts.push({
      project: name,
      severity: "warning",
      message: `${name} is a client project cooling off \u2014 check if anything's blocked`,
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
