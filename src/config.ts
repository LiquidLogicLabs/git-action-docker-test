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
};

export function getInputs(): DockerTestInputs {
  const image = core.getInput('image');
  if (!image) {
    throw new Error("Input 'image' is required");
  }

  const verboseInput = parseBoolean(core.getInput('verbose'), false, 'verbose');
  const envStepDebug = (process.env.ACTIONS_STEP_DEBUG || '').toLowerCase();
  const stepDebugEnabled = (typeof core.isDebug === 'function' && core.isDebug()) || envStepDebug === 'true' || envStepDebug === '1';
  const verbose = verboseInput || stepDebugEnabled;

  const timeout = parseNumber(core.getInput('timeout'), 120, 'timeout');
  const startupTimeout = parseNumber(core.getInput('startupTimeout'), 60, 'startupTimeout');
  const minimalEnvInput = core.getInput('minimalEnv');
  const skipHealthcheck = parseBoolean(core.getInput('skipHealthcheck'), false, 'skipHealthcheck');
  const skipS6Check = parseBoolean(core.getInput('skipS6Check'), false, 'skipS6Check');
  const requiredServices = core.getInput('requiredServices');
  const errorPatterns = parseJsonArray(core.getInput('errorPatterns'), 'errorPatterns');
  const mountDockerSocket = parseBoolean(core.getInput('mountDockerSocket'), false, 'mountDockerSocket');

  return {
    image,
    timeout,
    startupTimeout,
    minimalEnv: parseJsonObject(minimalEnvInput, 'minimalEnv'),
    skipHealthcheck,
    skipS6Check,
    requiredServices,
    errorPatterns,
    mountDockerSocket,
    verbose,
  };
}
