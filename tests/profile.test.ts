import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const askJson = vi.fn();
vi.mock("../src/ai", () => ({ askJson: (...a: unknown[]) => askJson(...a) }));
vi.mock("pdf-parse/lib/pdf-parse.js", () => ({ default: vi.fn(async () => ({ text: "resume text" })) }));

import { loadProfile } from "../src/profile";

const profile = {
  name: "A B",
  email: "a@b.com",
  phone: null,
  linkedin: null,
  github: null,
  location: null,
  totalExperienceYears: null,
  skills: ["ts"],
  workHistory: [],
  education: [],
};

describe("resume parse", () => {
  beforeEach(() => askJson.mockReset().mockResolvedValue(profile));

  it("parses once, caches by hash, re-parses when the PDF changes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jp-"));
    const pdfPath = path.join(dir, "r.pdf");
    const cache = path.join(dir, "cache.json");
    writeFileSync(pdfPath, "v1");

    const p1 = await loadProfile(pdfPath, cache);
    const p2 = await loadProfile(pdfPath, cache);
    expect(p1.email).toBe("a@b.com");
    expect(p2).toEqual(p1);
    expect(askJson).toHaveBeenCalledTimes(1);

    writeFileSync(pdfPath, "v2");
    await loadProfile(pdfPath, cache);
    expect(askJson).toHaveBeenCalledTimes(2);
  });
});
