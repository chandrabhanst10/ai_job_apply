import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadApplied, markApplied, removeFromJobs, urlHash } from "../src/store";

const tmp = () => mkdtempSync(path.join(tmpdir(), "jp-"));

describe("dedupe", () => {
  it("normalizes tracking params, fragments and trailing slashes", () => {
    expect(urlHash("https://Jobs.Example.com/a/1/?utm_source=x#top")).toBe(urlHash("https://jobs.example.com/a/1"));
    expect(urlHash("https://x.com/a/1")).not.toBe(urlHash("https://x.com/a/2"));
  });

  it("persists applied hashes as a plain list", () => {
    const f = path.join(tmp(), "applied.json");
    expect(loadApplied(f).size).toBe(0);
    markApplied("https://x.com/a/1", f);
    markApplied("https://x.com/a/1?utm_medium=y", f);
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual([urlHash("https://x.com/a/1")]);
    expect(loadApplied(f).has(urlHash("https://x.com/a/1/"))).toBe(true);
  });

  it("removes processed URLs from jobs.txt but keeps the rest", () => {
    const f = path.join(tmp(), "jobs.txt");
    writeFileSync(f, "# note\nhttps://x.com/a/1\nhttps://x.com/a/2\n");
    removeFromJobs(["https://x.com/a/1/"], f);
    expect(readFileSync(f, "utf8")).toBe("# note\nhttps://x.com/a/2\n");
  });
});
