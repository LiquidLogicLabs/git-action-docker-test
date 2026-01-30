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
import { getInputWithFallback, parseBoolean, parseJsonArray, parseJsonObject, parseNumber } from "./lib/inputs";
import { checkLogsForErrors, getContainerLogs, saveLogs } from "./lib/logs";
import { execCommand } from "./lib/exec";
import { sleep } from "./lib/utils";

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
    const image = getInputWithFallback("image");
    if (!image) {
      throw new Error("Input 'image' is required");
    }

    // Use core.debug plus optional verbose info for detailed logs.
    const verboseInput = parseBoolean(getInputWithFallback("verbose"), false, "verbose");
    const envStepDebug = (process.env.ACTIONS_STEP_DEBUG || "").toLowerCase();
    const stepDebugEnabled = core.isDebug() || envStepDebug === "true" || envStepDebug === "1";
    const verbose = verboseInput || stepDebugEnabled;
    const debug = (message: string): void => {
      core.debug(message);
      if (verbose) {
        core.info(`[DEBUG] ${message}`);
      }
    };

    const timeout = parseNumber(
      getInputWithFallback("timeout"),
      120,
      "timeout"
    );
    const deadlineMs = Date.now() + timeout * 1000;
    const startupTimeout = parseNumber(
      getInputWithFallback("startupTimeout", "startup_timeout"),
      60,
      "startupTimeout"
    );
    const minimalEnvInput = getInputWithFallback("minimalEnv", "minimal_env");
    const skipHealthcheck = parseBoolean(
      getInputWithFallback("skipHealthcheck", "skip_healthcheck"),
      false,
      "skipHealthcheck"
    );
    const skipS6Check = parseBoolean(
      getInputWithFallback("skipS6Check", "skip_s6_check"),
      false,
      "skipS6Check"
    );
    const requiredServicesInput = getInputWithFallback(
      "requiredServices",
      "required_services"
    );
    const errorPatternsInput = getInputWithFallback("errorPatterns", "error_patterns");
    const mountDockerSocket = parseBoolean(
      getInputWithFallback("mountDockerSocket", "mount_docker_socket"),
      false,
      "mountDockerSocket"
    );

    const minimalEnv = parseJsonObject(minimalEnvInput, "minimalEnv");
    const customErrorPatterns = parseJsonArray(errorPatternsInput, "errorPatterns");

    core.info("==========================================");
    core.info(`Testing Docker Image: ${image}`);
    core.info("==========================================");
    for (const [key, value] of Object.entries(minimalEnv)) {
      maybeMaskSecret(key, value);
    }
    debug(`Minimal env keys: ${Object.keys(minimalEnv).join(",") || "(none)"}`);
    debug(`Mount docker socket: ${mountDockerSocket}`);

    core.info("Step 1: Extracting healthcheck from image...");
    const healthcheckCmd = await extractHealthcheck(image);
    if (healthcheckCmd) {
      healthcheckDetected = true;
      core.info(`  Healthcheck detected: ${healthcheckCmd}`);
    } else {
      core.info("  No healthcheck detected in image");
    }

    core.info("Step 2: Starting container...");
    const envArgs = buildEnvArgs(minimalEnv);
    const dockerArgs = ["run", "-d", "--rm", ...envArgs];

    if (mountDockerSocket) {
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

    dockerArgs.push(image);
    const runResult = await execCommand("docker", dockerArgs, true, true);
    if (runResult.exitCode !== 0) {
      throw new Error(`Failed to start container: ${runResult.stderr || runResult.stdout}`);
    }
    containerId = runResult.stdout;
    core.info(`  Container started: ${containerId}`);

    core.info("Step 3: Waiting for container to be running...");
    await waitForContainer(containerId, startupTimeout, deadlineMs);

    core.info("Step 4: Discovering s6 services...");
    const services = skipS6Check
      ? { allServices: [], longrunServices: [] }
      : await discoverServices(containerId);
    servicesDetected = services.allServices;
    if (skipS6Check) {
      core.info("  Skipping s6 discovery (skipS6Check=true)");
    } else if (services.allServices.length > 0) {
      core.info(
        `  Found ${services.allServices.length} service(s): ${services.allServices.join(" ")}`
      );
    } else {
      core.info("  No s6 services discovered");
    }

    let requiredServices = requiredServicesInput
      .split(",")
      .map((service) => service.trim())
      .filter(Boolean);

    if (requiredServices.length === 0 && services.longrunServices.length > 0) {
      requiredServices = services.longrunServices;
      core.info(`  Using auto-detected longrun services: ${requiredServices.join(",")}`);
    }

    core.info("Step 5: Verifying s6 services...");
    if (!skipS6Check && requiredServices.length > 0) {
      for (const service of requiredServices) {
        core.info(`  Checking service: ${service}`);
        let status = "";
        // Some images start services asynchronously after the container is running.
        const serviceDeadlineMs = Math.min(deadlineMs, Date.now() + startupTimeout * 1000);
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
    } else if (skipS6Check) {
      core.info("  Skipping s6 service check (skipS6Check=true)");
    } else {
      core.info("  Skipping s6 service check (no required services specified)");
    }

    core.info("Step 6: Checking logs for errors...");
    if (Date.now() > deadlineMs) {
      throw new Error("Overall timeout exceeded before log inspection");
    }
    const logCheck = await checkLogsForErrors(containerId, customErrorPatterns);
    latestLogs = logCheck.logs;
    saveLogs(latestLogs);
    if (!logCheck.ok) {
      const preview = logCheck.matchedLines.slice(0, 20).join("\n");
      debug(`Matched patterns: ${logCheck.matchedPatterns.join(", ")}`);
      debug(`Matched lines (first 20):\n${preview}`);
      throw new Error("Errors detected in logs");
    }

    core.info("Step 7: Verifying healthcheck...");
    if (!skipHealthcheck && healthcheckDetected) {
      await checkHealthcheck(containerId, startupTimeout, deadlineMs);
      core.info("  ✓ Healthcheck passed");
    } else if (skipHealthcheck) {
      core.info("  Skipping healthcheck verification (skipHealthcheck=true)");
    } else {
      core.info("  No healthcheck to verify (container is running)");
    }

    core.info("==========================================");
    core.info("✓ All tests passed!");
    core.info("==========================================");

    core.setOutput("status", "success");
    core.setOutput("healthcheckDetected", String(healthcheckDetected));
    core.setOutput("servicesDetected", JSON.stringify(servicesDetected));
    core.setOutput("healthcheck_detected", String(healthcheckDetected));
    core.setOutput("services_detected", JSON.stringify(servicesDetected));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setOutput("status", "failure");
    core.setOutput("healthcheckDetected", String(healthcheckDetected));
    core.setOutput("servicesDetected", JSON.stringify(servicesDetected));
    core.setOutput("healthcheck_detected", String(healthcheckDetected));
    core.setOutput("services_detected", JSON.stringify(servicesDetected));
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
