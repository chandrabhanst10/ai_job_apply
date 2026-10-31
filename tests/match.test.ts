import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ai", () => ({ askJson: vi.fn().mockRejectedValue(new Error("quota")) }));

import { companyFromUrl, locationOk, scoreJob, shouldApply } from "../src/match";

const profile: any = { name: "A", email: "a@b.c", skills: ["TypeScript", "React", "Node.js", "AWS"], workHistory: [], education: [] };

describe("match fallback when AI fails", () => {
  it("scores by keyword overlap and applies on strong match", async () => {
    const m = await scoreJob(profile, "Senior Engineer\nWe use TypeScript, React, Node.js and AWS. Pune office.", "https://jobs.lever.co/acme/1", ["Pune"]);
    expect(m.fallback).toBe(true);
    expect(m.score).toBeGreaterThanOrEqual(70);
    expect(shouldApply(m)).toBe(true);
    expect(m).toMatchObject({ company: "Acme", role: "Senior Engineer", location: "Pune" });
  });

  it("does not apply on weak match or thin JD", async () => {
    const weak = await scoreJob(profile, "Role\nJava, Spring Boot, Kafka, Kubernetes, React", "https://x.com/j");
    expect(shouldApply(weak)).toBe(false);
    const thin = await scoreJob(profile, "Role\nReact only", "https://x.com/j");
    expect(thin.score).toBe(0);
  });

  it("derives company from URL", () => {
    expect(companyFromUrl("https://acme.keka.com/careers/jobdetails/1")).toBe("Acme");
    expect(companyFromUrl("https://careers.foo.co.in/x")).toBe("Foo");
  });
});

describe("locationOk", () => {
  const cities = ["Pune", "Gurugram"];
  it("filters by preferred cities", () => {
    expect(locationOk("Pune, Maharashtra", cities)).toBe(true);
    expect(locationOk("Gurgaon", cities)).toBe(true);
    expect(locationOk("Bengaluru", cities)).toBe(false);
    expect(locationOk("Remote - India", cities)).toBe(true);
    expect(locationOk("Unknown", cities)).toBe(true);
  });
});
