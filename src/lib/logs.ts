import * as core from "@actions/core";
import * as fs from "fs";
import { execCommand } from "./exec";

const DEFAULT_ERROR_PATTERNS = [
  "\\[ERROR\\]",
  "ERROR:",
  "level=error",
  "level=ERROR",
  "\\bERROR\\b",
  "\\[FATAL\\]",
  "FATAL:",
  "level=fatal",
  "level=FATAL",
  "\\bFATAL\\b",
  "\\[CRITICAL\\]",
  "CRITICAL:",
  "level=critical",
  "level=CRITICAL",
  "\\bCRITICAL\\b",
  "failed to start",
  "cannot start",
  "startup failed",
  "exited with code"
];

// Fetch container logs (stdout/stderr combined).
export async function getContainerLogs(containerId: string): Promise<string> {
  const result = await execCommand("docker", ["logs", containerId], true, true);
  return result.stdout || result.stderr || "";
}

// Persist logs in /tmp for artifact collection on GitHub Actions.
export function saveLogs(logs: string): void {
  if (!process.env.GITHUB_ACTIONS) return;
  try {
    fs.mkdirSync("/tmp/test-logs", { recursive: true });
    fs.writeFileSync("/tmp/test-logs/container-logs.txt", logs);
  } catch {
    core.warning("Failed to save logs to /tmp/test-logs/container-logs.txt");
  }
}

function compilePatterns(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern, "i"));
    } catch {
      core.warning(`Skipping invalid regex pattern: ${pattern}`);
    }
  }
  return compiled;
}

// Scan logs for default and custom error patterns.
export async function checkLogsForErrors(
  containerId: string,
  customPatterns: string[]
): Promise<{ ok: boolean; matchedPatterns: string[]; matchedLines: string[]; logs: string }> {
  const logs = await getContainerLogs(containerId);
  const lines = logs.split("\n");
  const patterns = [...DEFAULT_ERROR_PATTERNS, ...customPatterns];
  const regexes = compilePatterns(patterns);

  const matchedPatterns: string[] = [];
  const matchedLines: string[] = [];

  for (let i = 0; i < regexes.length; i += 1) {
    const regex = regexes[i];
    const pattern = patterns[i];
    const matches = lines.filter((line) => regex.test(line));
    if (matches.length > 0) {
      matchedPatterns.push(pattern);
      matchedLines.push(...matches);
      core.info(`⚠️  Pattern '${pattern}' matched ${matches.length} line(s).`);
    }
  }

  if (matchedPatterns.length > 0) {
    core.info("ERROR: Errors detected in logs.");
    return { ok: false, matchedPatterns, matchedLines, logs };
  }

  core.info("✓ No errors detected in logs.");
  return { ok: true, matchedPatterns, matchedLines, logs };
}
