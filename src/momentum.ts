import type { GitInfo, MomentumData, MomentumTrend } from "./types";

export function computeMomentum(git: GitInfo): MomentumData {
  if (!git.hasGit || git.recentCommits.length === 0) {
    return {
      streak: 0,
      daysSinceLastCommit: git.daysSinceLastCommit === Infinity ? -1 : git.daysSinceLastCommit,
      lastSessionCommits: 0,
      lastSessionDuration: "no activity",
      lastSessionDate: "never",
      trend: "lost",
    };
  }

  const commitsByDay = groupCommitsByDay(git.recentCommits);
  const streak = computeStreak(commitsByDay);
  const lastSession = getLastSession(commitsByDay);
  const trend = computeTrend(streak, git.daysSinceLastCommit);

  return {
    streak,
    daysSinceLastCommit: git.daysSinceLastCommit,
    lastSessionCommits: lastSession.commits,
    lastSessionDuration: lastSession.duration,
    lastSessionDate: lastSession.date,
    trend,
  };
}

function groupCommitsByDay(
  commits: { hash: string; date: string; message: string }[]
): Map<string, Date[]> {
  const byDay = new Map<string, Date[]>();
  for (const c of commits) {
    const d = new Date(c.date);
    const key = d.toISOString().split("T")[0];
    const existing = byDay.get(key) ?? [];
    existing.push(d);
    byDay.set(key, existing);
  }
  return byDay;
}

function computeStreak(commitsByDay: Map<string, Date[]>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let checkDate = new Date(today);

  // If no commits today, start checking from yesterday
  const todayKey = checkDate.toISOString().split("T")[0];
  if (!commitsByDay.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (let i = 0; i < 30; i++) {
    const key = checkDate.toISOString().split("T")[0];
    if (commitsByDay.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function getLastSession(commitsByDay: Map<string, Date[]>): {
  commits: number;
  duration: string;
  date: string;
} {
  const sortedDays = [...commitsByDay.keys()].sort().reverse();
  if (sortedDays.length === 0) {
    return { commits: 0, duration: "no activity", date: "never" };
  }

  const latestDay = sortedDays[0];
  const timestamps = commitsByDay.get(latestDay)!;
  const commits = timestamps.length;

  if (commits === 1) {
    return { commits: 1, duration: "single commit", date: latestDay };
  }

  const sorted = timestamps.map((d) => d.getTime()).sort((a, b) => a - b);
  const diffMs = sorted[sorted.length - 1] - sorted[0];
  const diffHours = diffMs / (1000 * 60 * 60);
  const duration =
    diffHours < 0.1
      ? "single commit"
      : `${diffHours.toFixed(1)} hours`;

  return { commits, duration, date: latestDay };
}

function computeTrend(streak: number, daysSinceLastCommit: number): MomentumTrend {
  if (daysSinceLastCommit > 7) return "lost";
  if (daysSinceLastCommit > 2) return "cooling";
  if (streak >= 3) return "building";
  return "steady";
}
