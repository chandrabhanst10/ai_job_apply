import type { GoogleGenAI } from "@google/genai" with { "resolution-mode": "import" };
import type { ZodType } from "zod";

export class AiError extends Error {}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sliding-window limiter: at most `max` calls per `windowMs`. */
export class Throttle {
  private stamps: number[] = [];
  constructor(
    private max = 10,
    private windowMs = 60_000,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = sleepReal,
  ) {}
  async wait(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
      if (this.stamps.length < this.max) {
        this.stamps.push(t);
        return;
      }
      await this.sleep(this.windowMs - (t - this.stamps[0]) + 10);
    }
  }
}

const isRetryable = (e: any) =>
  [429, 503].includes(e?.status ?? e?.code) || /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(String(e?.message));

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 2000, sleep = sleepReal): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= retries || !isRetryable(e)) throw e;
      await sleep(baseMs * 2 ** i);
    }
  }
}

const throttle = new Throttle();
let client: GoogleGenAI | undefined;
let tripped = false; // quota/outage hit: stop calling for the rest of this run

export const aiAvailable = () => !!process.env.GEMINI_API_KEY && !tripped;
export const resetAi = () => (tripped = false);
const model = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

async function generate(system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  if (!aiAvailable()) throw new AiError("AI unavailable");
  if (!client) {
    const { GoogleGenAI: G } = await import("@google/genai"); // ESM-only package
    client = new G({ apiKey: process.env.GEMINI_API_KEY });
  }
  try {
    const res = await withRetry(async () => {
      await throttle.wait();
      return client!.models.generateContent({
        model: model(),
        contents: user,
        config: { systemInstruction: system, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
      });
    });
    return (res.text ?? "").trim();
  } catch (e) {
    if (isRetryable(e)) tripped = true;
    throw new AiError((e as Error).message);
  }
}

export const askText = (system: string, user: string, maxTokens = 1024) => generate(system, user, maxTokens, false);

/** Throws AiError on any failure (unavailable, quota, bad JSON). Callers must fall back. */
export async function askJson<T>(schema: ZodType<T>, system: string, user: string): Promise<T> {
  const raw = await generate(`${system}\nReturn ONLY valid JSON.`, user, 2048, true);
  try {
    return schema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")));
  } catch (e) {
    throw new AiError(`bad AI output: ${(e as Error).message}`);
  }
}
