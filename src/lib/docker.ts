import * as core from "@actions/core";
import { execCommand } from "./exec";
import { assertNotOptionLike, assertShellSafe } from "./argv";
import { ServiceDiscovery } from "./types";
import { sleep } from "./utils";

function parseLines(result: { stdout: string; exitCode: number }): string[] {
  if (result.exitCode !== 0) return [];
  return result.stdout
    ? result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

// Return the healthcheck command string if present.
export async function extractHealthcheck(image: string): Promise<string> {
  assertNotOptionLike(image, "image name");
  const result = await execCommand(
    "docker",
    [
      "inspect",
      "--format",
      "{{if .Config.Healthcheck}}{{json .Config.Healthcheck.Test}}{{end}}",
      image
    ],
    true,
    true
  );

  if (result.exitCode !== 0 || !result.stdout || result.stdout === "null") {
    return "";
  }

  try {
    const parsed = JSON.parse(result.stdout);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return String(parsed[parsed.length - 1]);
    }
  } catch {
    core.debug(`Failed to parse healthcheck JSON: ${result.stdout}`);
  }

  return "";
}

// Discover all s6 services and longrun services via s6-rc directories.
export async function discoverServices(containerId: string): Promise<ServiceDiscovery> {
  const allServicesResult = await execCommand(
    "docker",
    [
      "exec",
      containerId,
      "sh",
      "-c",
      "ls -1 /etc/s6-overlay/s6-rc.d/*/type 2>/dev/null | xargs -I {} dirname {} | xargs -I {} basename {}"
    ],
    true,
    true
  );

  const longrunResult = await execCommand(
    "docker",
    [
      "exec",
      containerId,
      "sh",
      "-c",
      'for svc in /etc/s6-overlay/s6-rc.d/*/type; do [ "$(cat $svc 2>/dev/null)" = "longrun" ] && basename $(dirname $svc); done'
    ],
    true,
    true
  );

  // Many "minimal" images (distroless/scratch) do not have a shell.
  // Treat inability to execute discovery commands as "no services discovered".
  if (allServicesResult.exitCode !== 0) {
    core.debug(`s6 discovery (all services) skipped/failed: ${allServicesResult.stderr || allServicesResult.stdout}`);
  }
  if (longrunResult.exitCode !== 0) {
    core.debug(`s6 discovery (longrun services) skipped/failed: ${longrunResult.stderr || longrunResult.stdout}`);
  }

  const allServices = parseLines(allServicesResult);
  const longrunServices = parseLines(longrunResult);

  return { allServices, longrunServices };
}

// Wait for the container to reach running state before timeout.
export async function waitForContainer(
  containerId: string,
  timeoutSeconds: number,
  deadlineMs: number
): Promise<void> {
  let elapsed = 0;
  while (elapsed < timeoutSeconds) {
    if (Date.now() > deadlineMs) {
      throw new Error("Overall timeout exceeded while waiting for container");
    }
    const result = await execCommand("docker", [
      "inspect",
      "--format",
      "{{.State.Status}}",
      containerId
    ]);
    const state = result.stdout || "unknown";
    if (state === "running") return;
    if (state === "exited") {
      throw new Error("Container exited immediately");
    }
    await sleep(1000);
    elapsed += 1;
  }
  throw new Error(`Container did not start within ${timeoutSeconds}s`);
}

// Query s6 service status output (first line).
export async function checkService(containerId: string, service: string): Promise<string> {
  // The service name reaches docker's argv AND, in the shellFallback below, is
  // interpolated into a `sh -c` script. Both guards are needed: assertShellSafe allows a
  // leading "-" (legal in a basename) and assertNotOptionLike allows everything else.
  assertNotOptionLike(service, "service name");
  assertShellSafe(service, "service name");
  // Avoid assuming a shell exists in the container. Try direct exec first.
  const primary = await execCommand(
    "docker",
    ["exec", containerId, "s6-svstat", `/run/s6/services/${service}`],
    true,
    true
  );
  const primaryLines = parseLines(primary);
  if (primaryLines[0]) return primaryLines[0];

  const secondary = await execCommand(
    "docker",
    ["exec", containerId, "s6-svstat", `/run/service/${service}`],
    true,
    true
  );
  const secondaryLines = parseLines(secondary);
  if (secondaryLines[0]) return secondaryLines[0];

  // Fallback: some images provide a shell but not s6-svstat directly in PATH.
  const shellFallback = await execCommand(
    "docker",
    [
      "exec",
      containerId,
      "sh",
      "-c",
      `(
        s6-svstat /run/s6/services/${service} 2>/dev/null || true
      ) | head -1 || true; \
       (
        s6-svstat /run/service/${service} 2>/dev/null || true
      ) | head -1 || true`
    ],
    true,
    true
  );

  const shellLines = (shellFallback.exitCode === 0 ? shellFallback.stdout : "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return shellLines[0] || "down";
}

// Wait for the container healthcheck to become healthy.
export async function checkHealthcheck(
  containerId: string,
  timeoutSeconds: number,
  deadlineMs: number
): Promise<void> {
  let elapsed = 0;
  while (elapsed < timeoutSeconds) {
    if (Date.now() > deadlineMs) {
      throw new Error("Overall timeout exceeded while checking healthcheck");
    }
    const result = await execCommand("docker", [
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      containerId
    ]);
    const health = result.stdout || "none";
    if (health === "healthy") return;
    if (health === "unhealthy") {
      throw new Error("Healthcheck failed");
    }
    await sleep(2000);
    elapsed += 2;
  }
  throw new Error(`Healthcheck did not pass within ${timeoutSeconds}s`);
}

// Build docker -e arguments from a string map.
export function buildEnvArgs(env: Record<string, string>): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    assertNotOptionLike(key, "environment variable name");
    args.push("-e", `${key}=${value}`);
  }
  return args;
}
