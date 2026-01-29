jest.mock("@actions/core", () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn()
}));

jest.mock("../src/lib/exec", () => ({
  execCommand: jest.fn()
}));

jest.mock("fs", () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}));

import * as fs from "fs";
import { execCommand } from "../src/lib/exec";
import { checkLogsForErrors, getContainerLogs, saveLogs } from "../src/lib/logs";

describe("logs helpers", () => {
  beforeEach(() => {
    (execCommand as unknown as jest.Mock).mockReset();
    (fs.mkdirSync as unknown as jest.Mock).mockReset();
    (fs.writeFileSync as unknown as jest.Mock).mockReset();
    delete process.env.GITHUB_ACTIONS;
  });

  it("getContainerLogs returns stdout when present", async () => {
    (execCommand as unknown as jest.Mock).mockResolvedValue({
      stdout: "line1\nline2",
      stderr: "",
      exitCode: 0
    });

    await expect(getContainerLogs("cid")).resolves.toBe("line1\nline2");
  });

  it("getContainerLogs falls back to stderr", async () => {
    (execCommand as unknown as jest.Mock).mockResolvedValue({
      stdout: "",
      stderr: "oops",
      exitCode: 1
    });

    await expect(getContainerLogs("cid")).resolves.toBe("oops");
  });

  it("checkLogsForErrors returns ok when no patterns match", async () => {
    (execCommand as unknown as jest.Mock).mockResolvedValue({
      stdout: "all good\n",
      stderr: "",
      exitCode: 0
    });

    const result = await checkLogsForErrors("cid", ["does-not-match"]);
    expect(result.ok).toBe(true);
    expect(result.matchedPatterns).toEqual([]);
    expect(result.matchedLines).toEqual([]);
    expect(result.logs).toContain("all good");
  });

  it("checkLogsForErrors returns failure and aggregates matches", async () => {
    (execCommand as unknown as jest.Mock).mockResolvedValue({
      stdout: "[ERROR] bad\nFATAL: very bad\n",
      stderr: "",
      exitCode: 0
    });

    const result = await checkLogsForErrors("cid", ["FATAL:"]);
    expect(result.ok).toBe(false);
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
    expect(result.matchedLines.join("\n")).toContain("bad");
  });

  it("checkLogsForErrors skips invalid regex patterns", async () => {
    (execCommand as unknown as jest.Mock).mockResolvedValue({
      stdout: "nothing here\n",
      stderr: "",
      exitCode: 0
    });

    const result = await checkLogsForErrors("cid", ["["]);
    expect(result.ok).toBe(true);
  });

  it("saveLogs is a no-op outside GitHub Actions", () => {
    saveLogs("logs");
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("saveLogs writes logs on GitHub Actions", () => {
    process.env.GITHUB_ACTIONS = "true";
    saveLogs("hello");
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("saveLogs warns on write failure", () => {
    process.env.GITHUB_ACTIONS = "true";
    (fs.mkdirSync as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("nope");
    });

    // Should not throw
    expect(() => saveLogs("hello")).not.toThrow();
  });
});
