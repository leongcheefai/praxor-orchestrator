export interface ProjectConfig {
  name: string;
  path: string;
  type: "saas" | "client" | "micro-tool";
  platform: "web" | "ios" | "both";
  status: "active" | "parked";
  description: string;
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
}

export interface ClaudeMdInfo {
  exists: boolean;
  currentGoal: string | null;
  inProgress: string[];
  knownIssues: string[];
}

export type HealthStatus = "\u{1F7E2}" | "\u{1F7E1}" | "\u{1F534}" | "\u26AA" | "\u2753";

export interface ProjectReport {
  config: ProjectConfig;
  git: GitInfo;
  claudeMd: ClaudeMdInfo;
  health: HealthStatus;
}
