import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ai", () => ({ askJson: vi.fn().mockRejectedValue(new Error("quota")) }));
vi.mock("pdf-parse/lib/pdf-parse.js", () => ({
  default: vi.fn(async () => ({
    text: "Jane Doe\njane@x.com | +91 98765 43210 | github.com/jane\nTypeScript, React, AWS. 5 years experience",
  })),
}));

import { loadProfile } from "../src/profile";

describe("profile fallback when AI fails", () => {
  it("extracts with regex and does not cache", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jp-"));
    const pdf = path.join(dir, "r.pdf");
    const cache = path.join(dir, "c.json");
    writeFileSync(pdf, "x");
    const p = await loadProfile(pdf, cache);
    expect(p).toMatchObject({ name: "Jane Doe", email: "jane@x.com", github: "github.com/jane", totalExperienceYears: 5 });
    expect(p.skills).toEqual(expect.arrayContaining(["TypeScript", "React", "AWS"]));
    expect(existsSync(cache)).toBe(false);
  });
});
