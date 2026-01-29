jest.mock("@actions/core", () => ({
  debug: jest.fn(),
  warning: jest.fn(),
  info: jest.fn()
}));

jest.mock("../src/lib/utils", () => ({
  sleep: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../src/lib/exec", () => ({
  execCommand: jest.fn()
}));

import { execCommand } from "../src/lib/exec";
import {
  checkHealthcheck,
  checkService,
  buildEnvArgs,
  discoverServices,
  extractHealthcheck,
  waitForContainer
} from "../src/lib/docker";

describe("docker helpers", () => {
  beforeEach(() => {
    (execCommand as unknown as jest.Mock).mockReset();
  });

  describe("extractHealthcheck", () => {
    it("returns empty string when inspect fails", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "",
        stderr: "nope",
        exitCode: 1
      });
      await expect(extractHealthcheck("img:tag")).resolves.toBe("");
    });

    it("returns last element of healthcheck array", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(["CMD-SHELL", "curl -f http://localhost" ]),
        stderr: "",
        exitCode: 0
      });
      await expect(extractHealthcheck("img:tag")).resolves.toContain("localhost");
    });

    it("returns empty string on invalid JSON", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "{",
        stderr: "",
        exitCode: 0
      });
      await expect(extractHealthcheck("img:tag")).resolves.toBe("");
    });
  });

  describe("discoverServices", () => {
    it("parses services from stdout", async () => {
      (execCommand as unknown as jest.Mock)
        .mockResolvedValueOnce({ stdout: "svc1\nsvc2\n", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "long1\n", stderr: "", exitCode: 0 });

      const services = await discoverServices("cid");
      expect(services.allServices).toEqual(["svc1", "svc2"]);
      expect(services.longrunServices).toEqual(["long1"]);
    });

    it("handles empty outputs", async () => {
      (execCommand as unknown as jest.Mock)
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

      const services = await discoverServices("cid");
      expect(services.allServices).toEqual([]);
      expect(services.longrunServices).toEqual([]);
    });
  });

  describe("waitForContainer", () => {
    it("returns when container is running", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "running",
        stderr: "",
        exitCode: 0
      });
      await expect(waitForContainer("cid", 1, Date.now() + 10_000)).resolves.toBeUndefined();
    });

    it("throws if container exits", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "exited",
        stderr: "",
        exitCode: 0
      });
      await expect(waitForContainer("cid", 1, Date.now() + 10_000)).rejects.toThrow(
        /exited immediately/
      );
    });

    it("throws on timeout", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "created",
        stderr: "",
        exitCode: 0
      });
      await expect(waitForContainer("cid", 1, Date.now() + 10_000)).rejects.toThrow(
        /did not start/
      );
    });

    it("throws when overall deadline is exceeded", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "created",
        stderr: "",
        exitCode: 0
      });
      await expect(waitForContainer("cid", 10, Date.now() - 1)).rejects.toThrow(
        /Overall timeout exceeded/
      );
    });
  });

  describe("checkService", () => {
    it("returns stdout when present", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "up (pid 1)",
        stderr: "",
        exitCode: 0
      });
      await expect(checkService("cid", "svc")).resolves.toBe("up (pid 1)");
    });

    it("returns 'down' when empty", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0
      });
      await expect(checkService("cid", "svc")).resolves.toBe("down");
    });
  });

  describe("checkHealthcheck", () => {
    it("returns when healthy", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "healthy",
        stderr: "",
        exitCode: 0
      });
      await expect(checkHealthcheck("cid", 1, Date.now() + 10_000)).resolves.toBeUndefined();
    });

    it("throws when unhealthy", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "unhealthy",
        stderr: "",
        exitCode: 0
      });
      await expect(checkHealthcheck("cid", 1, Date.now() + 10_000)).rejects.toThrow(
        /Healthcheck failed/
      );
    });

    it("throws when it never becomes healthy", async () => {
      (execCommand as unknown as jest.Mock).mockResolvedValue({
        stdout: "starting",
        stderr: "",
        exitCode: 0
      });
      await expect(checkHealthcheck("cid", 1, Date.now() + 10_000)).rejects.toThrow(
        /did not pass/
      );
    });
  });

  describe("buildEnvArgs", () => {
    it("builds -e args from env object", () => {
      expect(buildEnvArgs({ FOO: "bar", BAZ: "1" })).toEqual([
        "-e",
        "FOO=bar",
        "-e",
        "BAZ=1"
      ]);
    });
  });
});
