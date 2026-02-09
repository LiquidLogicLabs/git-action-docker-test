import * as core from "@actions/core";
import * as fs from "fs";
import {
  checkHealthcheck,
  checkService,
  discoverServices,
  extractHealthcheck,
  waitForContainer,
  buildEnvArgs
} from "./lib/docker";
import { getInputs } from "./config";
import { checkLogsForErrors, getContainerLogs, saveLogs } from "./lib/logs";
import { execCommand } from "./lib/exec";
import { sleep } from "./lib/utils";
import { Logger } from "./logger";

export async function run(): Promise<void> {
  let containerId = "";
  let healthcheckDetected = false;
  let servicesDetected: string[] = [];
  let latestLogs = "";

  const maybeMaskSecret = (key: string, value: string): void => {
    // Best-effort masking: only mask values that look like secrets by key name.
    if (!value) return;
    if (/(token|password|secret|key|apikey|api_key)/i.test(key)) {
      core.setSecret(value);
    }
  };

  try {
    const inputs = getInputs();

    const logger = new Logger(inputs.verbose, inputs.debugMode);
    const deadlineMs = Date.now() + inputs.timeout * 1000;

    core.info("==========================================");
    core.info(`Testing Docker Image: ${inputs.image}`);
    core.info("==========================================");
    for (const [key, value] of Object.entries(inputs.minimalEnv)) {
      maybeMaskSecret(key, value);
    }
    logger.verboseInfo(`Minimal env keys: ${Object.keys(inputs.minimalEnv).join(",") || "(none)"}`);
    logger.verboseInfo(`Mount docker socket: ${inputs.mountDockerSocket}`);

    core.info("Step 1: Extracting healthcheck from image...");
    const healthcheckCmd = await extractHealthcheck(inputs.image);
    if (healthcheckCmd) {
      healthcheckDetected = true;
      core.info(`  Healthcheck detected: ${healthcheckCmd}`);
    } else {
      core.info("  No healthcheck detected in image");
    }

    core.info("Step 2: Starting container...");
    const envArgs = buildEnvArgs(inputs.minimalEnv);
    const dockerArgs = ["run", "-d", "--rm", ...envArgs];

    if (inputs.mountDockerSocket) {
      try {
        const stat = fs.statSync("/var/run/docker.sock");
        if (stat.isSocket()) {
          dockerArgs.push("-v", "/var/run/docker.sock:/var/run/docker.sock:ro");
        } else {
          core.warning("/var/run/docker.sock is not a socket, skipping mount");
        }
      } catch {
        core.warning("/var/run/docker.sock not found, skipping mount");
      }
    }

    dockerArgs.push(inputs.image);
    const runResult = await execCommand("docker", dockerArgs, true, true);
    if (runResult.exitCode !== 0) {
      throw new Error(`Failed to start container: ${runResult.stderr || runResult.stdout}`);
    }
    containerId = runResult.stdout;
    core.info(`  Container started: ${containerId}`);

    core.info("Step 3: Waiting for container to be running...");
    await waitForContainer(containerId, inputs.startupTimeout, deadlineMs);

    core.info("Step 4: Discovering s6 services...");
    const services = inputs.skipS6Check
      ? { allServices: [], longrunServices: [] }
      : await discoverServices(containerId);
    servicesDetected = services.allServices;
    if (inputs.skipS6Check) {
      core.info("  Skipping s6 discovery (skip-s6-check=true)");
    } else if (services.allServices.length > 0) {
      core.info(
        `  Found ${services.allServices.length} service(s): ${services.allServices.join(" ")}`
      );
    } else {
      core.info("  No s6 services discovered");
    }

    let requiredServices = inputs.requiredServices
      .split(",")
      .map((service) => service.trim())
      .filter(Boolean);

    if (requiredServices.length === 0 && services.longrunServices.length > 0) {
      requiredServices = services.longrunServices;
      core.info(`  Using auto-detected longrun services: ${requiredServices.join(",")}`);
    }

    core.info("Step 5: Verifying s6 services...");
    if (!inputs.skipS6Check && requiredServices.length > 0) {
      for (const service of requiredServices) {
        core.info(`  Checking service: ${service}`);
        let status = "";
        // Some images start services asynchronously after the container is running.
        const serviceDeadlineMs = Math.min(deadlineMs, Date.now() + inputs.startupTimeout * 1000);
        while (Date.now() <= serviceDeadlineMs) {
          status = await checkService(containerId, service);
          core.info(`    Service status: ${status}`);
          if (status.includes("up")) break;
          await sleep(1000);
        }
        if (!status.includes("up")) {
          throw new Error(`Required service ${service} is not running`);
        }
        core.info(`    ✓ Service ${service} is up`);
      }
      core.info("  ✓ All required services are running");
    } else if (inputs.skipS6Check) {
      core.info("  Skipping s6 service check (skip-s6-check=true)");
    } else {
      core.info("  Skipping s6 service check (no required services specified)");
    }

    core.info("Step 6: Checking logs for errors...");
    if (Date.now() > deadlineMs) {
      throw new Error("Overall timeout exceeded before log inspection");
    }
    const logCheck = await checkLogsForErrors(containerId, inputs.errorPatterns);
    latestLogs = logCheck.logs;
    saveLogs(latestLogs);
    if (!logCheck.ok) {
      const preview = logCheck.matchedLines.slice(0, 20).join("\n");
      logger.verboseInfo(`Matched patterns: ${logCheck.matchedPatterns.join(", ")}`);
      logger.verboseInfo(`Matched lines (first 20):\n${preview}`);
      throw new Error("Errors detected in logs");
    }

    core.info("Step 7: Verifying healthcheck...");
    if (!inputs.skipHealthcheck && healthcheckDetected) {
      await checkHealthcheck(containerId, inputs.startupTimeout, deadlineMs);
      core.info("  ✓ Healthcheck passed");
    } else if (inputs.skipHealthcheck) {
      core.info("  Skipping healthcheck verification (skip-healthcheck=true)");
    } else {
      core.info("  No healthcheck to verify (container is running)");
    }

    core.info("==========================================");
    core.info("✓ All tests passed!");
    core.info("==========================================");

    core.setOutput("status", "success");
    core.setOutput("healthcheck-detected", String(healthcheckDetected));
    core.setOutput("services-detected", JSON.stringify(servicesDetected));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setOutput("status", "failure");
    core.setOutput("healthcheck-detected", String(healthcheckDetected));
    core.setOutput("services-detected", JSON.stringify(servicesDetected));
    if (containerId) {
      latestLogs = latestLogs || (await getContainerLogs(containerId));
      core.setOutput("logs", latestLogs);
      saveLogs(latestLogs);
    }
    core.setFailed(message);
  } finally {
    if (containerId) {
      await execCommand("docker", ["stop", containerId], true, true);
      await execCommand("docker", ["rm", "-f", containerId], true, true);
    }
  }
}

// Allow unit tests to import and call run() without side effects.
if (process.env.NODE_ENV !== "test") {
  void run();
}
