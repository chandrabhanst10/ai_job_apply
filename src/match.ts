import { z } from "zod";
import { askJson } from "./ai";
import { log } from "./logger";
import type { Profile } from "./profile";
import { extractSkills } from "./skills";

export const MIN_SCORE = 70;

export const MatchSchema = z.object({
  company: z.string().default("Unknown"),
  role: z.string().default("Unknown"),
  location: z.string().default("Unknown"),
  score: z.number().min(0).max(100),
  reason: z.string().default(""),
});
export type Match = z.infer<typeof MatchSchema> & { fallback?: boolean }; // fallback: AI was unavailable

const SYSTEM = `You score job fit. Given a candidate profile and job description text, return JSON: {"company","role","location","score","reason"}. score is 0-100 reflecting how well the candidate's skills, seniority and experience match the role's requirements. reason max 15 words. If the text is not a job posting, score 0. Judge only from the profile; do not assume skills not listed.`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function companyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/lever\.co|greenhouse\.io|jobvite\.com|workable\.com|ashbyhq\.com/.test(host))
      return cap(u.pathname.split("/").filter(Boolean)[0] ?? "Unknown");
    const parts = host.split(".");
    if (/keka(hire)?\.com$/.test(host)) return cap(parts[0]);
    const i = ["co", "com", "org", "net"].includes(parts.at(-2)!) ? -3 : -2;
    return cap(parts.at(i) ?? parts[0]);
  } catch {
    return "Unknown";
  }
}

/** No-AI scoring: share of the JD's known tech keywords that appear in the resume. */
export function fallbackMatch(profile: Profile, jd: string, url: string, cities: string[] = []): Match {
  const jdSkills = extractSkills(jd);
  const mine = new Set([...extractSkills(profile.skills.join(" ")), ...profile.skills].map((s) => s.toLowerCase()));
  const hit = jdSkills.filter((s) => mine.has(s.toLowerCase()));
  return {
    company: companyFromUrl(url),
    role: jd.split("\n").find((l) => l.trim())?.trim().slice(0, 100) ?? "Unknown",
    location: cities.find((c) => new RegExp(`\\b${c}\\b`, "i").test(jd)) ?? "Unknown",
    score: jdSkills.length >= 3 ? Math.round((100 * hit.length) / jdSkills.length) : 0,
    reason: `keyword overlap ${hit.length}/${jdSkills.length}`,
    fallback: true,
  };
}

export async function scoreJob(profile: Profile, jd: string, url = "", cities: string[] = []): Promise<Match> {
  const p = {
    experienceYears: profile.totalExperienceYears,
    skills: profile.skills,
    workHistory: profile.workHistory.map((w) => ({ role: w.role, company: w.company, summary: w.summary })),
    education: profile.education,
  };
  try {
    return await askJson(MatchSchema, SYSTEM, `PROFILE:\n${JSON.stringify(p)}\n\nJOB:\n${jd}`);
  } catch (e) {
    log.warn({ err: (e as Error).message }, "match: AI failed, keyword fallback");
    return fallbackMatch(profile, jd, url, cities);
  }
}

const ALIASES: Record<string, string[]> = { gurugram: ["gurgaon"], gurgaon: ["gurugram"], mumbai: ["navi mumbai", "bombay"] };

/** Unknown location passes (can't tell); remote passes; otherwise must mention a preferred city. */
export function locationOk(location: string, cities: string[]): boolean {
  const l = location.toLowerCase().trim();
  if (!l || l === "unknown" || /remote|anywhere|work from home|wfh|hybrid/.test(l)) return true;
  return cities.some((c) => [c, ...(ALIASES[c.toLowerCase()] ?? [])].some((n) => l.includes(n.toLowerCase())));
}

export const shouldApply = (m: Match) => m.score >= MIN_SCORE;
