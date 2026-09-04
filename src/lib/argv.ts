/**
 * Guards for values that reach an spawned program's argv.
 *
 * Passing an argv array stops the SHELL from interpreting a value. It does NOT stop the
 * spawned program's own option parser: a leading "-" is read as an option wherever it
 * appears in argv. The proven form of this bug is git, where `git push --receive-pack=<cmd>`
 * executes <cmd>; `docker` has the same shape, so a hostile value takes an OPTION slot
 * instead of the value slot the caller intended.
 */

/**
 * Reject a value that `docker` would read as an option rather than as a value.
 *
 * Image names, service names and environment variable names never legitimately begin with
 * "-", so this costs nothing.
 */
export function assertNotOptionLike(value: string | undefined, label: string): void {
  if (value !== undefined && value.startsWith("-")) {
    throw new Error(
      `Refusing to pass a ${label} beginning with "-" to docker: ${JSON.stringify(value)}. ` +
        "docker would read it as an option rather than as a value."
    );
  }
}

/**
 * Reject a value that would break out of a `sh -c` script it is interpolated into.
 *
 * Stricter than assertNotOptionLike and NOT a superset of it -- callers that interpolate
 * need both. checkService() builds a shell script by string concatenation, so a service
 * name containing ";", "|", "$", backticks, "&" or a newline executes attacker-chosen
 * commands rather than merely occupying the wrong argv slot.
 *
 * s6 service names are directory basenames, so an allowlist of the characters a basename
 * legitimately uses is the right shape here: anything outside it is refused rather than
 * escaped, because escaping is the thing that keeps going wrong.
 */
const SHELL_SAFE = /^[A-Za-z0-9._@+-][A-Za-z0-9._@+/-]*$/;

export function assertShellSafe(value: string, label: string): void {
  if (!SHELL_SAFE.test(value)) {
    throw new Error(
      `Refusing to interpolate a ${label} containing characters a shell would act on: ` +
        `${JSON.stringify(value)}. Allowed: letters, digits and ". _ @ + - /".`
    );
  }
}
