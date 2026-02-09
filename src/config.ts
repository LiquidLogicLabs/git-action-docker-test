import * as core from '@actions/core';
import { parseBoolean, parseJsonArray, parseJsonObject, parseNumber } from './lib/inputs';

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

  return {
    image,
    timeout,
    startupTimeout,
    minimalEnv: parseJsonObject(minimalEnvInput, 'minimal-env'),
    skipHealthcheck,
    skipS6Check,
    requiredServices,
    errorPatterns,
    mountDockerSocket,
    verbose,
    debugMode,
  };
}
