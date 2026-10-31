import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const APPLIED = () => path.resolve("applied.json");
const JOBS = () => path.resolve("jobs.txt");

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    [...u.searchParams.keys()].filter((k) => /^(utm_|ref$|source$|src$|gh_src$|lever-source)/i.test(k)).forEach((k) => u.searchParams.delete(k));
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export const urlHash = (url: string) => createHash("sha256").update(normalizeUrl(url)).digest("hex");

export function loadApplied(file = APPLIED()): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set<string>(JSON.parse(readFileSync(file, "utf8")));
}

export function markApplied(url: string, file = APPLIED()): void {
  const set = loadApplied(file);
  set.add(urlHash(url));
  writeFileSync(file, JSON.stringify([...set], null, 2));
}

/** Drops processed URLs from jobs.txt; keeps untouched lines (incl. failed/unprocessed) as-is. */
export function removeFromJobs(processed: string[], file = JOBS()): void {
  const gone = new Set(processed.map(urlHash));
  const kept = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => !gone.has(urlHash(l)) || !/^https?:\/\//i.test(l.trim()));
  writeFileSync(file, kept.join("\n").replace(/\n*$/, "\n").replace(/^\n$/, ""));
}
