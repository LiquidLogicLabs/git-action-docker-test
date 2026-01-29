import * as exec from "@actions/exec";
import { ExecResult } from "./types";

// Execute a command and return trimmed output and exit code.
export async function execCommand(
  command: string,
  args: string[] = [],
  silent = true,
  ignoreReturnCode = false
): Promise<ExecResult> {
  const result = await exec.getExecOutput(command, args, {
    silent,
    ignoreReturnCode
  });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    exitCode: result.exitCode
  };
}
