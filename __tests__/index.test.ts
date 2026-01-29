type CoreMock = {
  getInput: jest.Mock;
  setOutput: jest.Mock;
  setFailed: jest.Mock;
  info: jest.Mock;
  warning: jest.Mock;
  debug: jest.Mock;
  setSecret: jest.Mock;
};

describe("action run()", () => {
  const makeCore = (): CoreMock => ({
    getInput: jest.fn(),
    setOutput: jest.fn(),
    setFailed: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    debug: jest.fn(),
    setSecret: jest.fn()
  });

  it("sets success outputs on happy path", async () => {
    const core = makeCore();

    jest.resetModules();
    jest.doMock("@actions/core", () => core);
    jest.doMock("../src/lib/utils", () => ({
      sleep: jest.fn().mockResolvedValue(undefined)
    }));
    jest.doMock("fs", () => ({
      statSync: jest.fn().mockReturnValue({ isSocket: () => true })
    }));

    jest.doMock("../src/lib/docker", () => ({
      extractHealthcheck: jest.fn().mockResolvedValue("curl -f http://localhost"),
      waitForContainer: jest.fn().mockResolvedValue(undefined),
      discoverServices: jest
        .fn()
        .mockResolvedValue({ allServices: ["svc1"], longrunServices: ["svc1"] }),
      checkService: jest.fn().mockResolvedValue("up (pid 1)"),
      checkHealthcheck: jest.fn().mockResolvedValue(undefined),
      buildEnvArgs: jest.fn().mockReturnValue(["-e", "PUID=1000"]) 
    }));

    jest.doMock("../src/lib/logs", () => ({
      checkLogsForErrors: jest.fn().mockResolvedValue({
        ok: true,
        matchedPatterns: [],
        matchedLines: [],
        logs: "ok"
      }),
      getContainerLogs: jest.fn().mockResolvedValue(""),
      saveLogs: jest.fn()
    }));

    const execCommand = jest
      .fn()
      // docker run
      .mockResolvedValueOnce({ stdout: "container-id", stderr: "", exitCode: 0 })
      // docker stop
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
      // docker rm
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    jest.doMock("../src/lib/exec", () => ({
      execCommand
    }));

    const inputs: Record<string, string> = {
      image: "img:tag",
      verbose: "false",
      timeout: "120",
      startupTimeout: "60",
      minimalEnv: '{"PUID":"1000"}',
      skipHealthcheck: "false",
      skipS6Check: "false",
      requiredServices: "",
      errorPatterns: "[]",
      mountDockerSocket: "false"
    };

    core.getInput.mockImplementation((name: string) => inputs[name] ?? "");

    const mod = await import("../src/index");
    await mod.run();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("status", "success");
    expect(core.setOutput).toHaveBeenCalledWith("healthcheckDetected", "true");
    expect(core.setOutput).toHaveBeenCalledWith("servicesDetected", JSON.stringify(["svc1"]));

    // ensure cleanup attempted
    expect(execCommand).toHaveBeenCalledWith("docker", ["stop", "container-id"], true, true);
    expect(execCommand).toHaveBeenCalledWith("docker", ["rm", "-f", "container-id"], true, true);
  });

  it("sets failure outputs and logs on error", async () => {
    const core = makeCore();

    jest.resetModules();
    jest.doMock("@actions/core", () => core);
    jest.doMock("../src/lib/utils", () => ({
      sleep: jest.fn().mockResolvedValue(undefined)
    }));
    jest.doMock("fs", () => ({
      statSync: jest.fn()
    }));

    jest.doMock("../src/lib/docker", () => ({
      extractHealthcheck: jest.fn().mockResolvedValue(""),
      waitForContainer: jest.fn().mockResolvedValue(undefined),
      discoverServices: jest
        .fn()
        .mockResolvedValue({ allServices: [], longrunServices: [] }),
      checkService: jest.fn(),
      checkHealthcheck: jest.fn(),
      buildEnvArgs: jest.fn().mockReturnValue([])
    }));

    jest.doMock("../src/lib/logs", () => ({
      checkLogsForErrors: jest.fn().mockResolvedValue({
        ok: false,
        matchedPatterns: ["ERR"],
        matchedLines: ["ERR"],
        logs: "ERR"
      }),
      getContainerLogs: jest.fn().mockResolvedValue("fallback logs"),
      saveLogs: jest.fn()
    }));

    const execCommand = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "container-id", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    jest.doMock("../src/lib/exec", () => ({
      execCommand
    }));

    const inputs: Record<string, string> = {
      image: "img:tag",
      verbose: "false",
      timeout: "120",
      startupTimeout: "60",
      minimalEnv: '{"PUID":"1000"}',
      skipHealthcheck: "true",
      skipS6Check: "true",
      requiredServices: "",
      errorPatterns: "[]",
      mountDockerSocket: "false"
    };

    core.getInput.mockImplementation((name: string) => inputs[name] ?? "");

    const mod = await import("../src/index");
    await mod.run();

    expect(core.setOutput).toHaveBeenCalledWith("status", "failure");
    expect(core.setFailed).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("logs", expect.any(String));
  });

  it("emits verbose debug logs and masks likely secrets", async () => {
    const core = makeCore();

    jest.resetModules();
    jest.doMock("@actions/core", () => core);
    jest.doMock("../src/lib/utils", () => ({
      sleep: jest.fn().mockResolvedValue(undefined)
    }));
    jest.doMock("fs", () => ({
      statSync: jest.fn().mockReturnValue({ isSocket: () => false })
    }));

    jest.doMock("../src/lib/docker", () => ({
      extractHealthcheck: jest.fn().mockResolvedValue(""),
      waitForContainer: jest.fn().mockResolvedValue(undefined),
      discoverServices: jest.fn().mockResolvedValue({ allServices: [], longrunServices: [] }),
      checkService: jest.fn(),
      checkHealthcheck: jest.fn(),
      buildEnvArgs: jest.fn().mockReturnValue([])
    }));

    jest.doMock("../src/lib/logs", () => ({
      checkLogsForErrors: jest.fn().mockResolvedValue({
        ok: true,
        matchedPatterns: [],
        matchedLines: [],
        logs: "ok"
      }),
      getContainerLogs: jest.fn().mockResolvedValue(""),
      saveLogs: jest.fn()
    }));

    const execCommand = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "container-id", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    jest.doMock("../src/lib/exec", () => ({
      execCommand
    }));

    const inputs: Record<string, string> = {
      image: "img:tag",
      verbose: "true",
      timeout: "120",
      startupTimeout: "60",
      minimalEnv: '{"API_TOKEN":"super-secret"}',
      skipHealthcheck: "true",
      skipS6Check: "true",
      requiredServices: "",
      errorPatterns: "[]",
      mountDockerSocket: "true"
    };

    core.getInput.mockImplementation((name: string) => inputs[name] ?? "");

    const mod = await import("../src/index");
    await mod.run();

    expect(core.setSecret).toHaveBeenCalledWith("super-secret");
    expect(core.warning).toHaveBeenCalledWith(
      "/var/run/docker.sock is not a socket, skipping mount"
    );
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining("[DEBUG]"));
  });

  it("fails when a required service is not up", async () => {
    const core = makeCore();

    jest.resetModules();
    jest.doMock("@actions/core", () => core);
    jest.doMock("../src/lib/utils", () => ({
      sleep: jest.fn().mockResolvedValue(undefined)
    }));
    jest.doMock("fs", () => ({
      statSync: jest.fn()
    }));

    jest.doMock("../src/lib/docker", () => ({
      extractHealthcheck: jest.fn().mockResolvedValue(""),
      waitForContainer: jest.fn().mockResolvedValue(undefined),
      discoverServices: jest
        .fn()
        .mockResolvedValue({ allServices: ["svc1"], longrunServices: ["svc1"] }),
      checkService: jest.fn().mockResolvedValue("down"),
      checkHealthcheck: jest.fn(),
      buildEnvArgs: jest.fn().mockReturnValue([])
    }));

    const getContainerLogs = jest.fn().mockResolvedValue("container logs");
    jest.doMock("../src/lib/logs", () => ({
      checkLogsForErrors: jest.fn().mockResolvedValue({
        ok: true,
        matchedPatterns: [],
        matchedLines: [],
        logs: "ok"
      }),
      getContainerLogs,
      saveLogs: jest.fn()
    }));

    const execCommand = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "container-id", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

    jest.doMock("../src/lib/exec", () => ({
      execCommand
    }));

    const inputs: Record<string, string> = {
      image: "img:tag",
      verbose: "false",
      timeout: "10",
      startupTimeout: "1",
      minimalEnv: '{"PUID":"1000"}',
      skipHealthcheck: "true",
      skipS6Check: "false",
      requiredServices: "svc1",
      errorPatterns: "[]",
      mountDockerSocket: "false"
    };

    core.getInput.mockImplementation((name: string) => inputs[name] ?? "");

    const mod = await import("../src/index");
    await mod.run();

    expect(core.setOutput).toHaveBeenCalledWith("status", "failure");
    expect(getContainerLogs).toHaveBeenCalledWith("container-id");
  });
});
