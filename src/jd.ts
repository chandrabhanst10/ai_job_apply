import { chromium, type Browser } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";

const BLOCKED = /captcha|verify you are human|are you a robot|access denied|unusual traffic|cf-challenge/i;

export function readJobUrls(file = path.resolve("jobs.txt")): string[] {
  const urls = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
  return [...new Set(urls)];
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** Read-only fetch of visible JD text. Returns null if blocked/empty. */
export async function fetchJd(browser: Browser, url: string): Promise<string | null> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    const text = (await page.innerText("body")).replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 200 || BLOCKED.test(text.slice(0, 1500))) return null;
    return `${await page.title().catch(() => "")}\n\n${text}`.slice(0, 12_000);
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}
