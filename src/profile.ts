import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { z } from "zod";
import { askJson } from "./ai";
import { log } from "./logger";
import { extractSkills } from "./skills";

const s = z.string().nullable().default(null);

export const ProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: s,
  linkedin: s,
  github: s,
  location: s,
  totalExperienceYears: z.number().nullable().default(null),
  skills: z.array(z.string()).default([]),
  workHistory: z
    .array(z.object({ company: z.string(), role: z.string(), start: s, end: s, summary: s }))
    .default([]),
  education: z
    .array(z.object({ institution: z.string(), degree: s, year: s }))
    .default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

const SYSTEM = `Extract a candidate profile from resume text. JSON keys: name, email, phone, linkedin, github, location, totalExperienceYears (number), skills (string[]), workHistory ([{company, role, start, end, summary}]), education ([{institution, degree, year}]). Use null for missing values. Never invent data.`;

/** Regex-only profile used when AI is unavailable. */
export function fallbackProfile(text: string): Profile {
  const m = (re: RegExp) => text.match(re)?.[0]?.trim() ?? null;
  const years = text.match(/(\d{1,2})(?:\.\d)?\+?\s*(?:years|yrs)/i);
  return ProfileSchema.parse({
    name: text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "",
    email: m(/[\w.+-]+@[\w-]+\.[\w.-]+/) ?? "",
    phone: m(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10}/),
    linkedin: m(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s)]+/i),
    github: m(/(?:https?:\/\/)?github\.com\/[^\s)]+/i),
    totalExperienceYears: years ? Number(years[1]) : null,
    skills: extractSkills(text),
  });
}

export async function parseResume(text: string): Promise<{ profile: Profile; fromAi: boolean }> {
  try {
    return { profile: await askJson(ProfileSchema, SYSTEM, text), fromAi: true };
  } catch (e) {
    log.warn({ err: (e as Error).message }, "profile: AI failed, using regex fallback");
    return { profile: fallbackProfile(text), fromAi: false };
  }
}

export async function loadProfile(
  pdfPath = path.resolve("resume/resume.pdf"),
  cachePath = path.resolve("profile.cache.json"),
): Promise<Profile> {
  const buf = readFileSync(pdfPath);
  const hash = createHash("sha256").update(buf).digest("hex");

  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    if (cached.hash === hash) {
      log.info("profile: cache hit");
      return ProfileSchema.parse(cached.profile);
    }
  }

  log.info("profile: parsing resume");
  const { text } = await pdf(buf);
  const { profile, fromAi } = await parseResume(text);
  if (fromAi) writeFileSync(cachePath, JSON.stringify({ hash, profile }, null, 2)); // never cache the fallback
  return profile;
}
