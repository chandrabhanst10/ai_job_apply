import { describe, expect, it, vi } from "vitest";
import { dateInTz, sendSummary } from "../src/mailer";

const job = (company: string, url: string) => ({
  url,
  match: { company, role: "Engineer", location: "Pune", score: 90, reason: "" },
});

describe("email only on success", () => {
  it("sends nothing when there are zero successes", async () => {
    const sendMail = vi.fn();
    expect(await sendSummary([], "me@x.com", { sendMail } as any)).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends exactly one email listing all successes", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const ok = await sendSummary([job("Acme", "https://a.com/1"), job("Beta", "https://b.com/2")], "me@x.com", { sendMail } as any);
    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("me@x.com");
    expect(mail.subject).toMatch(/^Jobs Applied - \d{4}-\d{2}-\d{2}$/);
    for (const s of ["Acme", "Beta", "Pune", "Engineer", "https://a.com/1", "https://b.com/2"]) expect(mail.text).toContain(s);
  });
});

it("email date uses the configured timezone", () => {
  const d = new Date("2026-01-01T20:00:00Z");
  expect(dateInTz("Asia/Kolkata", d)).toBe("2026-01-02");
  expect(dateInTz("UTC", d)).toBe("2026-01-01");
});
