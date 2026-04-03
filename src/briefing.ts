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

  // Attention Needed (alerts)
  const allAlerts = reports.flatMap((r) => r.alerts);
  if (allAlerts.length > 0) {
    lines.push("## Attention Needed");
    lines.push("");
    const severityIcon: Record<string, string> = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
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
      lines.push(`${i + 1}. **${r.config.name}** (score: ${r.score!.score.toFixed(2)}) \u2014 ${r.score!.reasoning}`);
    });
    lines.push("");
  }

  // Momentum table
  const active = reports.filter((r) => r.config.status === "active");
  if (active.length > 0) {
    const trendIcon: Record<string, string> = { building: "\u{1F7E2}", steady: "\u{1F7E1}", cooling: "\u{1F7E0}", lost: "\u{1F534}" };
    lines.push("## Momentum");
    lines.push("");
    lines.push("| Project | Streak | Last Session | Trend |");
    lines.push("|---------|--------|-------------|-------|");
    for (const r of active) {
      const session = r.momentum.lastSessionCommits > 0
        ? `${r.momentum.lastSessionCommits} commits, ${r.momentum.lastSessionDuration} (${r.momentum.lastSessionDate})`
        : "no activity";
      const noteText = (r.statusNotes && r.statusNotes.length > 0)
        ? ` \u{1F4DD} "${r.statusNotes[r.statusNotes.length - 1].message}"`
        : "";
      lines.push(`| ${r.config.name} | ${r.momentum.streak} days | ${session} | ${trendIcon[r.momentum.trend]} ${r.momentum.trend}${noteText} |`);
    }
    lines.push("");
  }

  // Status Notes
  const allNotes = reports.flatMap((r) => r.statusNotes ?? []);
  if (allNotes.length > 0) {
    lines.push("## Status Notes");
    lines.push("");
    for (const note of allNotes) {
      const ts = new Date(note.timestamp).toLocaleString();
      lines.push(`- **${note.project}**: ${note.message} _(${ts})_`);
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
      if (r.statusNotes && r.statusNotes.length > 0) {
        lines.push(`- **Status notes:**`);
        for (const note of r.statusNotes) {
          const ts = new Date(note.timestamp).toLocaleString();
          lines.push(`  - ${note.message} _(${ts})_`);
        }
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
      ...(r.statusNotes && r.statusNotes.length > 0 && { statusNotes: r.statusNotes }),
      ...(r.config.clientName && { clientName: r.config.clientName }),
      ...(r.config.budget && { budget: r.config.budget }),
      ...(r.config.parkedReason && { parkedReason: r.config.parkedReason }),
      ...(r.config.reactivateWhen && { reactivateWhen: r.config.reactivateWhen }),
    })),
  };
}
