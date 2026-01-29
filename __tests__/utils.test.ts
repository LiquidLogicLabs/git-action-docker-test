import { sleep } from "../src/lib/utils";

describe("sleep", () => {
  it("resolves after the requested delay", async () => {
    jest.useFakeTimers();

    const promise = sleep(10);
    jest.advanceTimersByTime(10);

    await expect(promise).resolves.toBeUndefined();

    jest.useRealTimers();
  });
});
