import { describe, expect, it, vi } from "vitest";
import { AiError, askJson, Throttle, withRetry } from "../src/ai";
import { z } from "zod";

describe("AI fallback plumbing", () => {
  it("throttle blocks the 11th call within a minute", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const th = new Throttle(10, 60_000, () => t, async (ms) => void ((t += ms), sleeps.push(ms)));
    for (let i = 0; i < 11; i++) await th.wait();
    expect(sleeps).toHaveLength(1);
    expect(t).toBeGreaterThanOrEqual(60_000);
  });

  it("retries 429 with exponential backoff, then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValueOnce({ status: 429 }).mockRejectedValueOnce({ status: 429 }).mockResolvedValue("ok");
    expect(await withRetry(fn, 3, 2000, sleep)).toBe("ok");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000]);
  });

  it("gives up after max retries and does not retry other errors", async () => {
    const always429 = vi.fn().mockRejectedValue({ status: 429 });
    await expect(withRetry(always429, 3, 1, async () => {})).rejects.toBeTruthy();
    expect(always429).toHaveBeenCalledTimes(4);
    const bad = vi.fn().mockRejectedValue(new Error("400 bad request"));
    await expect(withRetry(bad, 3, 1, async () => {})).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("askJson throws AiError (not crash) when no API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(askJson(z.object({}), "s", "u")).rejects.toBeInstanceOf(AiError);
    vi.unstubAllEnvs();
  });
});
