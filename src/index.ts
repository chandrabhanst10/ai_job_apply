import "dotenv/config";
import path from "node:path";
import { applyToJob } from "./apply/engine";
import { fetchJd, launchBrowser, readJobUrls } from "./jd";
import { log } from "./logger";
import { locationOk, scoreJob, shouldApply, type Match } from "./match";
import { sendSummary } from "./mailer";
import { loadProfile } from "./profile";
import { loadSettings } from "./settings";
import { loadApplied, markApplied, removeFromJobs, urlHash } from "./store";


async function run() {
  const settings = loadSettings();
  const profile = await loadProfile();
  const dryRun = process.env.DRY_RUN === "1";
  const applied = loadApplied();
  const all = readJobUrls();
  const urls = all.filter((u) => !applied.has(urlHash(u)));
  const processed: string[] = all.filter((u) => applied.has(urlHash(u))); // already applied: drop from jobs.txt
  log.info({ jobs: urls.length, duplicates: processed.length, dryRun }, "jobs loaded");

  const successes: { url: string; match: Match }[] = [];
  if (urls.length) {
    const browser = await launchBrowser();
    try {
      for (const url of urls) {
        const jd = await fetchJd(browser, url);
        if (!jd) {
          log.info({ url }, "skip: unreadable/blocked");
          processed.push(url);
          continue;
        }
        const match = await scoreJob(profile, jd, url, settings.preferredCities);
        log.info({ url, score: match.score, role: match.role, company: match.company }, "scored");
        if (match.fallback) {
          log.info({ url }, "skip for now: AI unavailable, kept in jobs.txt");
          continue;
        }
        if (!shouldApply(match) || !locationOk(match.location, settings.preferredCities)) {
          processed.push(url);
          continue;
        }

        const outcome = await applyToJob(browser, url, {
          profile,
          settings,
          match,
          resumePath: path.resolve("resume/resume.pdf"),
          dryRun,
        });
        log.info({ url, outcome }, "applied?");
        if (outcome === "success") {
          markApplied(url);
          successes.push({ url, match });
        }
        // failed stays in jobs.txt for retry; success/skipped are removed
        if (outcome !== "failed") processed.push(url);
      }
    } finally {
      await browser.close();
      if (!dryRun) removeFromJobs(processed);
    }
  } else if (!dryRun) removeFromJobs(processed);
  if (!dryRun) {
    try {
      await sendSummary(successes, profile.email);
    } catch (e) {
      log.error({ err: (e as Error).message }, "email failed"); // applications already recorded
    }
  }
  log.info({ successes: successes.length }, "run done");
}


run().catch((e) => {
  log.error(e);
  process.exit(1);
});
