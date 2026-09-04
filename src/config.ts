import * as core from '@actions/core';
import { parseBoolean, parseJsonArray, parseJsonObject, parseNumber } from './lib/inputs';
import { assertNotOptionLike, assertShellSafe } from './lib/argv';

export type DockerTestInputs = {
  image: string;
  timeout: number;
  startupTimeout: number;
  minimalEnv: Record<string, string>;
  skipHealthcheck: boolean;
  skipS6Check: boolean;
  requiredServices: string;
  errorPatterns: string[];
  mountDockerSocket: boolean;
  verbose: boolean;
  debugMode: boolean;
};

export function getInputs(): DockerTestInputs {
  const image = core.getInput('image');
  if (!image) {
    throw new Error("Input 'image' is required");
  }
  // Argument-injection guard, at the entry point. `image` is passed positionally to
  // `docker run` and `docker inspect`; docker's own option parser reads a leading "-" as
  // an option whatever the argv array does about the shell.
  assertNotOptionLike(image, 'image name');

  const verboseInput = parseBoolean(core.getInput('verbose'), false, 'verbose');
  const envStepDebug = (process.env.ACTIONS_STEP_DEBUG || '').toLowerCase();
  const stepDebugEnabled = (typeof core.isDebug === 'function' && core.isDebug()) || envStepDebug === 'true' || envStepDebug === '1';
  const debugMode = stepDebugEnabled;
  const verbose = verboseInput || debugMode;

  const timeout = parseNumber(core.getInput('timeout'), 120, 'timeout');
  const startupTimeout = parseNumber(core.getInput('startup-timeout'), 60, 'startup-timeout');
  const minimalEnvInput = core.getInput('minimal-env');
  const skipHealthcheck = parseBoolean(core.getInput('skip-healthcheck'), false, 'skip-healthcheck');
  const skipS6Check = parseBoolean(core.getInput('skip-s6-check'), false, 'skip-s6-check');
  const requiredServices = core.getInput('required-services');
  const errorPatterns = parseJsonArray(core.getInput('error-patterns'), 'error-patterns');
  const mountDockerSocket = parseBoolean(core.getInput('mount-docker-socket'), false, 'mount-docker-socket');

  // required-services is split on "," and each element becomes an argv element AND is
  // interpolated into checkService()'s `sh -c` fallback. minimal-env keys become
  // `-e <key>=<value>`. Both are guarded here as well as at their use sites.
  for (const service of requiredServices.split(',').map((s) => s.trim()).filter(Boolean)) {
    assertNotOptionLike(service, 'service name');
    assertShellSafe(service, 'service name');
  }
  const minimalEnv = parseJsonObject(minimalEnvInput, 'minimal-env');
  for (const key of Object.keys(minimalEnv)) {
    assertNotOptionLike(key, 'environment variable name');
  }

  return {
    image,
    timeout,
    startupTimeout,
    minimalEnv,
    skipHealthcheck,
    skipS6Check,
    requiredServices,
    errorPatterns,
    mountDockerSocket,
    verbose,
    debugMode,
  };
}
