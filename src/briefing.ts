import type { ProjectReport, OrchestratorConfig } from "./types";

function formatDate(d: Date | null): string {
  if (!d) return "unknown";
  return d.toISOString().split("T")[0];
}

export function generateBriefing(reports: ProjectReport[], config: OrchestratorConfig): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const lines: string[] = [];

  lines.push(`# Morning Briefing - ${dateStr}`);
  lines.push("");

  // Alerts
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

  // Active projects sorted by recency
  const active = reports
    .filter((r) => r.config.status === "active")
    .sort((a, b) => {
      if (!a.git.lastCommitDate) return 1;
      if (!b.git.lastCommitDate) return -1;
      return b.git.lastCommitDate.getTime() - a.git.lastCommitDate.getTime();
    });

  if (active.length > 0) {
    lines.push("## Active Projects");
    lines.push("");

    for (const r of active) {
      lines.push(`### ${r.health} ${r.config.name}`);
      lines.push("");
      lines.push(`> ${r.config.description}`);
      lines.push("");
      lines.push(`- **Type:** ${r.config.type} | **Platform:** ${r.config.platform}`);
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

  // Daily focus
  lines.push("## Daily Focus");
  lines.push("");
  if (active.length > 0) {
    const top = active[0];
    lines.push(`Suggested focus: **${top.config.name}**`);
    if (top.claudeMd.currentGoal) {
      lines.push(`\u{1F3AF} ${top.claudeMd.currentGoal}`);
    }
    if (uncommitted.length > 0) {
      lines.push("");
      lines.push(`\u26A0\uFE0F Don't forget to commit changes in: ${uncommitted.map((r) => r.config.name).join(", ")}`);
    }
  } else {
    lines.push("No active projects. Add projects to orchestrator.config.ts.");
  }
  lines.push("");

  return lines.join("\n");
}

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
      ...(r.config.clientName && { clientName: r.config.clientName }),
      ...(r.config.budget && { budget: r.config.budget }),
      ...(r.config.parkedReason && { parkedReason: r.config.parkedReason }),
      ...(r.config.reactivateWhen && { reactivateWhen: r.config.reactivateWhen }),
    })),
  };
}
