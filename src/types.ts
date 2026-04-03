export interface ProjectConfig {
  name: string;
  repo: string; // GitHub "owner/repo" format
  branch: string; // branch to scan (default: "main")
  type: "saas" | "client" | "micro-tool";
  platform: "web" | "ios" | "both" | "cli";
  status: "active" | "parked";
  description: string;
  priority?: "high" | "medium" | "low";
  clientName?: string;
  budget?: { total: number; invoiced: number; currency: string };
  parkedReason?: string;
  reactivateWhen?: string;
}

export interface TelegramConfig {
  enabled: boolean;
}

export interface OrchestratorConfig {
  outputDir: string;
  stalenessThresholdDays: number;
  telegram?: TelegramConfig;
  projects: ProjectConfig[];
}

export interface GitInfo {
  lastCommitDate: Date | null;
  lastCommitMessage: string;
  daysSinceLastCommit: number;
  currentBranch: string;
  uncommittedChanges: boolean;
  hasGit: boolean;
  recentCommits: { hash: string; date: string; message: string }[];
}

export interface ClaudeMdInfo {
  exists: boolean;
  currentGoal: string | null;
  inProgress: string[];
  knownIssues: string[];
}

export type HealthStatus = "\u{1F7E2}" | "\u{1F7E1}" | "\u{1F534}" | "\u26AA" | "\u2753";

export type MomentumTrend = "building" | "steady" | "cooling" | "lost";

export interface MomentumData {
  streak: number;
  daysSinceLastCommit: number;
  lastSessionCommits: number;
  lastSessionDuration: string;
  lastSessionDate: string;
  trend: MomentumTrend;
}

export interface IssueInfo {
  total: number;
  bugs: number;
}

export interface ProjectScore {
  project: string;
  score: number;
  reasoning: string;
  factors: {
    priority: number;
    momentum: number;
    impact: number;
    engagement: number;
  };
}

export interface Alert {
  project: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface StatusNote {
  project: string;       // normalized project name
  message: string;
  timestamp: string;     // ISO 8601
}

export interface ProjectReport {
  config: ProjectConfig;
  git: GitInfo;
  claudeMd: ClaudeMdInfo;
  health: HealthStatus;
  momentum: MomentumData;
  issues: IssueInfo;
  score?: ProjectScore;
  alerts: Alert[];
  statusNotes?: StatusNote[];
}
