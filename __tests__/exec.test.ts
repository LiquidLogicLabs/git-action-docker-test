jest.mock("@actions/exec", () => ({
  getExecOutput: jest.fn()
}));

import * as exec from "@actions/exec";
import { execCommand } from "../src/lib/exec";

describe("execCommand", () => {
  it("trims output and returns exit code", async () => {
    (exec.getExecOutput as unknown as jest.Mock).mockResolvedValue({
      stdout: " hello \n",
      stderr: " err \n",
      exitCode: 2
    });

    const result = await execCommand("docker", ["ps"], true, true);

    expect(exec.getExecOutput).toHaveBeenCalledWith("docker", ["ps"], {
      silent: true,
      ignoreReturnCode: true
    });

    expect(result).toEqual({
      stdout: "hello",
      stderr: "err",
      exitCode: 2
    });
  });
});
