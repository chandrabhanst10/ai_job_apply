import { z } from "zod";
import { askJson, askText } from "../ai";
import type { Match } from "../match";
import type { Profile } from "../profile";
import type { Settings } from "../settings";
import type { Field } from "./fields";

const Answers = z.record(z.string(), z.string().nullable());

const SYSTEM = `You fill job application questions for a candidate. Use ONLY the profile and settings given. Never invent experience, skills, employers, numbers or credentials. Return JSON {"<id>": answer|null}.
Rules: choice fields (select/radio) must be answered with exactly one of the given options. Free text: max 60 words, factual. If the profile does not support a truthful answer, use null. For gender/race/disability/veteran questions choose a "decline/prefer not to say" option if present, else null.`;

export async function answerFields(
  profile: Profile,
  settings: Settings,
  fields: Field[],
): Promise<Record<string, string | null>> {
  if (!fields.length) return {};
  const q = fields.map((f) => ({ id: f.id, type: f.kind, question: f.label, options: f.options }));
  return askJson(
    Answers,
    SYSTEM,
    `PROFILE:\n${JSON.stringify(profile)}\n\nSETTINGS:\n${JSON.stringify(settings)}\n\nQUESTIONS:\n${JSON.stringify(q)}`,
  );
}

/** Only called when a cover letter is required. */
export async function coverLetter(profile: Profile, m: Match): Promise<string> {
  return askText(
    "Write a concise cover letter (max 170 words) using ONLY facts in the profile. Never invent experience. No placeholders, no address block; start with 'Dear Hiring Team,'.",
    `PROFILE:\n${JSON.stringify(profile)}\n\nROLE: ${m.role} at ${m.company}`,
    600,
  );
}
