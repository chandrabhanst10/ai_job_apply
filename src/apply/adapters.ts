import type { Page } from "playwright";

export type Adapter = { name: string; match: (url: string) => boolean; open: (page: Page, url: string) => Promise<Page> };

const APPLY_RE = /^\s*(apply( now| for this job| here| for this position)?|easy apply)\s*$/i;

export async function formSize(page: Page): Promise<number> {
  let max = 0;
  for (const f of page.frames()) {
    const n = await f.locator("input:not([type=hidden]), textarea, select").count().catch(() => 0);
    max = Math.max(max, n);
  }
  return max;
}

async function clickApply(page: Page, re = APPLY_RE): Promise<Page> {
  if ((await formSize(page)) >= 3) return page;
  const btn = page.getByRole("button", { name: re }).or(page.getByRole("link", { name: re })).first();
  if (!(await btn.isVisible().catch(() => false))) return page;
  const popup = page.context().waitForEvent("page", { timeout: 4000 }).catch(() => null);
  await btn.click().catch(() => {});
  const target = (await popup) ?? page;
  await target.waitForLoadState("domcontentloaded").catch(() => {});
  await target.waitForTimeout(2000);
  return target;
}

const go = async (page: Page, url: string) => {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
};

const withSuffix = (url: string, suffix: string) => {
  const u = new URL(url);
  if (!u.pathname.replace(/\/$/, "").endsWith(suffix)) u.pathname = u.pathname.replace(/\/$/, "") + "/" + suffix;
  return u.toString();
};

export const adapters: Adapter[] = [
  {
    name: "lever",
    match: (u) => /lever\.co/i.test(u),
    open: async (p, u) => (await go(p, withSuffix(u, "apply")), p),
  },
  {
    name: "jobvite",
    match: (u) => /jobvite\.com/i.test(u),
    open: async (p, u) => {
      await go(p, u);
      return clickApply(p);
    },
  },
  {
    name: "greenhouse",
    match: (u) => /greenhouse\.io|gh_jid=/i.test(u),
    open: async (p, u) => {
      await go(p, u);
      return clickApply(p);
    },
  },
  {
    name: "keka",
    match: (u) => /keka(hire)?\.com/i.test(u),
    open: async (p, u) => {
      await go(p, u);
      return clickApply(p);
    },
  },
  {
    name: "workday",
    match: (u) => /myworkdayjobs\.com|\.workday\.com/i.test(u),
    open: async (p, u) => {
      await go(p, u);
      const t = await clickApply(p);
      const manual = t.getByRole("button", { name: /apply manually/i }).or(t.getByRole("link", { name: /apply manually/i })).first();
      if (await manual.isVisible().catch(() => false)) {
        await manual.click().catch(() => {});
        await t.waitForTimeout(2000);
      }
      return t;
    },
  },
  {
    name: "generic",
    match: () => true,
    open: async (p, u) => {
      await go(p, u);
      return clickApply(p);
    },
  },
];

export const pickAdapter = (url: string) => adapters.find((a) => a.match(url))!;
