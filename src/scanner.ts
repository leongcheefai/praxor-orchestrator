import type { ProjectConfig, GitInfo, ClaudeMdInfo } from "./types";

const GITHUB_API = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN environment variable is required");
    process.exit(1);
  }
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "orchestrator-cli",
    Accept: "application/vnd.github.v3+json",
  };
}

async function resolveBranch(repo: string, configBranch: string): Promise<string | null> {
  // Try configured branch first
  const testUrl = `${GITHUB_API}/repos/${repo}/commits?sha=${configBranch}&per_page=1`;
  const testRes = await fetch(testUrl, { headers: getHeaders() });

  if (testRes.ok) return configBranch;

  if (testRes.status === 404) {
    // Branch not found — fetch repo's default branch
    const repoRes = await fetch(`${GITHUB_API}/repos/${repo}`, { headers: getHeaders() });
    if (repoRes.ok) {
      const repoData = (await repoRes.json()) as { default_branch: string };
      return repoData.default_branch;
    }
  }

  return null;
}

export async function scanGit(project: ProjectConfig): Promise<GitInfo> {
  try {
    const branch = await resolveBranch(project.repo, project.branch);
    if (!branch) {
      console.warn(`Repo not found: ${project.repo} — skipping`);
      return noGitInfo();
    }

    const url = `${GITHUB_API}/repos/${project.repo}/commits?sha=${branch}&per_page=5`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      console.error("Invalid GITHUB_TOKEN — authentication failed");
      process.exit(1);
    }

    if (res.status === 403) {
      const remaining = res.headers.get("X-RateLimit-Remaining");
      if (remaining === "0") {
        console.warn(`Rate limited — skipping ${project.name}`);
        return noGitInfo();
      }
    }

    if (res.status === 404) {
      console.warn(`Repo not found: ${project.repo} — skipping`);
      return noGitInfo();
    }

    if (!res.ok) {
      console.warn(`GitHub API error (${res.status}) for ${project.repo} — skipping`);
      return noGitInfo();
    }

    const commits = (await res.json()) as any[];

    if (commits.length === 0) {
      return {
        lastCommitDate: null,
        lastCommitMessage: "",
        daysSinceLastCommit: Infinity,
        currentBranch: branch,
        uncommittedChanges: false,
        hasGit: true,
        recentCommits: [],
      };
    }

    const lastCommitDate = new Date(commits[0].commit.author.date);
    const now = new Date();
    const daysSince = Math.floor(
      (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const recentCommits = commits.map((c: any) => ({
      hash: c.sha.slice(0, 7),
      date: c.commit.author.date,
      message: c.commit.message.split("\n")[0],
    }));

    return {
      lastCommitDate,
      lastCommitMessage: commits[0].commit.message.split("\n")[0],
      daysSinceLastCommit: daysSince,
      currentBranch: branch,
      uncommittedChanges: false,
      hasGit: true,
      recentCommits,
    };
  } catch (err) {
    console.warn(`Failed to fetch commits for ${project.repo}:`, (err as Error).message);
    return noGitInfo();
  }
}

export async function scanClaudeMd(project: ProjectConfig, branch?: string): Promise<ClaudeMdInfo> {
  const ref = branch || project.branch;
  const url = `${GITHUB_API}/repos/${project.repo}/contents/CLAUDE.md?ref=${ref}`;

  try {
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 404) {
      return { exists: false, currentGoal: null, inProgress: [], knownIssues: [] };
    }

    if (!res.ok) {
      console.warn(`Failed to fetch CLAUDE.md for ${project.repo} (${res.status})`);
      return { exists: false, currentGoal: null, inProgress: [], knownIssues: [] };
    }

    const data = (await res.json()) as { content: string; encoding: string };
    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return parseClaudeMd(content);
  } catch (err) {
    console.warn(`Failed to fetch CLAUDE.md for ${project.repo}:`, (err as Error).message);
    return { exists: false, currentGoal: null, inProgress: [], knownIssues: [] };
  }
}

function parseClaudeMd(content: string): ClaudeMdInfo {
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

function noGitInfo(): GitInfo {
  return {
    lastCommitDate: null,
    lastCommitMessage: "",
    daysSinceLastCommit: Infinity,
    currentBranch: "",
    uncommittedChanges: false,
    hasGit: false,
    recentCommits: [],
  };
}
