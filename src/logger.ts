import * as core from '@actions/core';

export class Logger {
  public readonly verbose: boolean;
  public readonly debugMode: boolean;

  constructor(verbose: boolean = false, debugMode: boolean = false) {
    this.verbose = verbose || debugMode;
    this.debugMode = debugMode;
  }

  info(message: string): void {
    core.info(message);
  }

  warning(message: string): void {
    core.warning(message);
  }

  error(message: string): void {
    core.error(message);
  }

  verboseInfo(message: string): void {
    if (this.verbose) {
      core.info(message);
    }
  }

  debug(message: string): void {
    if (this.debugMode) {
      core.info(`[DEBUG] ${message}`);
    } else {
      core.debug(message);
    }
  }

  isVerbose(): boolean {
    return this.verbose;
  }

  isDebug(): boolean {
    return this.debugMode;
  }
}
