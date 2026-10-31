import type { Browser, Frame, Page } from "playwright";
import { log } from "../logger";
import type { Match } from "../match";
import type { Profile } from "../profile";
import type { Settings } from "../settings";
import { pickAdapter } from "./adapters";
import { answerFields, coverLetter } from "./answer";
import { CONSENT, collectFields, pickOption, ruleValue, type Field } from "./fields";

export type Outcome = "success" | "skipped" | "failed";
export type Ctx = { profile: Profile; settings: Settings; match: Match; resumePath: string; dryRun?: boolean };

const CONFIRM =
  /thank you for (applying|your (application|interest))|application (has been |was )?(submitted|received|sent)|successfully (submitted|applied)|(we('ve| have)|we) received your application|your application (is|has been) (in|submitted|received)/i;
const SUBMIT = /^\s*(submit( application)?|send application|finish|apply now|apply)\s*$/i;
const NEXT = /^\s*(next|continue|save (and|&) continue|proceed)\s*$/i;
const BLOCK_TEXT =
  /verify you are human|i'?m not a robot|are you a robot|verification code|one[- ]time (password|code)|two-factor|multi-factor|\bmfa\b/i;
const CHALLENGE_FRAMES =
  'iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/api2/anchor"], iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"]';

async function allText(page: Page): Promise<string> {
  const parts = await Promise.all(page.frames().map((f) => f.innerText("body", { timeout: 3000 }).catch(() => "")));
  return parts.join("\n");
}

async function blocked(page: Page): Promise<boolean> {
  for (const f of page.frames()) {
    if (await f.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;
  }
  if (await page.locator(CHALLENGE_FRAMES).first().isVisible().catch(() => false)) return true;
  return BLOCK_TEXT.test((await allText(page)).slice(0, 4000));
}

const confirmed = async (page: Page) => CONFIRM.test(await allText(page));

async function pickFrame(page: Page): Promise<Frame> {
  let best = page.mainFrame();
  let max = -1;
  for (const f of page.frames()) {
    const n = await f.locator("input:not([type=hidden]), textarea, select").count().catch(() => 0);
    if (n > max) [best, max] = [f, n];
  }
  return best;
}

async function setValue(frame: Frame, f: Field, value: string): Promise<boolean> {
  try {
    if (f.kind === "text" || f.kind === "textarea") {
      await frame.locator(`[data-jp="${f.id}"]`).fill(value, { timeout: 5000 });
      return true;
    }
    const i = pickOption(f.options, value);
    if (i < 0) return false;
    if (f.kind === "select") {
      await frame.locator(`[data-jp="${f.id}"]`).selectOption({ label: f.options[i] }, { timeout: 5000 });
    } else if (f.kind === "radio") {
      await frame.locator(`[data-jp-g="${f.id}"][data-jp-o="${i}"]`).check({ force: true, timeout: 5000 });
    }
    return true;
  } catch {
    return false;
  }
}

/** Fills the current step. Returns labels of required fields that could not be filled truthfully. */
async function fillStep(frame: Frame, ctx: Ctx): Promise<string[]> {
  const fields = await collectFields(frame);
  const unresolved: string[] = [];
  const ask: Field[] = [];

  for (const f of fields) {
    if (f.kind === "file") {
      if (/resume|cv/i.test(f.label) || fields.filter((x) => x.kind === "file").length === 1) {
        await frame.locator(`[data-jp="${f.id}"]`).setInputFiles(ctx.resumePath).catch(() => unresolved.push(f.label));
      } else if (f.required) unresolved.push(f.label);
      continue;
    }
    if (f.value) continue;
    if (f.kind === "checkbox") {
      if (f.required) {
        if (CONSENT.test(f.label)) await frame.locator(`[data-jp="${f.id}"]`).check({ force: true }).catch(() => {});
        else unresolved.push(f.label);
      }
      continue;
    }
    const rule = ruleValue(f.label, ctx.profile, ctx.settings);
    if (rule && (await setValue(frame, f, rule))) continue;
    if (!f.required) continue;
    if (/cover letter/i.test(f.label) && f.kind !== "select" && f.kind !== "radio") {
      const cl = await coverLetter(ctx.profile, ctx.match).catch(() => "");
      if (cl && (await setValue(frame, f, cl))) continue;
    }
    ask.push(f);
  }

  if (ask.length) {
    const answers = await answerFields(ctx.profile, ctx.settings, ask).catch(() => ({}) as Record<string, string | null>);
    for (const f of ask) {
      const a = answers[f.id];
      if (!a || !(await setValue(frame, f, a))) unresolved.push(f.label);
    }
  }
  return unresolved;
}

export async function applyToJob(browser: Browser, url: string, ctx: Ctx): Promise<Outcome> {
  const bctx = await browser.newContext();
  let page = await bctx.newPage();
  try {
    page = await pickAdapter(url).open(page, url);

    for (let step = 0; step < 7; step++) {
      if (await blocked(page)) return skip(url, "login/captcha/mfa");
      const frame = await pickFrame(page);
      const missing = await fillStep(frame, ctx);
      if (missing.length) return skip(url, `unanswerable required: ${missing.join("; ").slice(0, 160)}`);
      if (!(await frame.locator("input:not([type=hidden]), textarea, select").count())) return skip(url, "no form");

      const submit = frame.getByRole("button", { name: SUBMIT }).first();
      if (await submit.isVisible().catch(() => false)) {
        if (ctx.dryRun) return skip(url, "dry-run: form filled, not submitted");
        const before = await confirmed(page);
        await submit.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(4000);
        if (!before && (await confirmed(page))) return "success";
        if (await blocked(page)) return skip(url, "blocked after submit");
        log.warn({ url }, "submit clicked, no confirmation detected");
        return "failed";
      }

      const next = frame.getByRole("button", { name: NEXT }).first();
      if (!(await next.isVisible().catch(() => false))) return skip(url, "no submit/next button");
      await next.click();
      await page.waitForTimeout(2500);
    }
    return skip(url, "too many steps");
  } catch (e) {
    log.warn({ url, err: (e as Error).message }, "apply error");
    return "failed";
  } finally {
    await bctx.close();
  }
}

function skip(url: string, reason: string): Outcome {
  log.info({ url, reason }, "skip");
  return "skipped";
}
