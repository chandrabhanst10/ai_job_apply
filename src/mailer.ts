import nodemailer, { type Transporter } from "nodemailer";
import type { Match } from "./match";

export type Applied = { url: string; match: Match };

export const dateInTz = (tz = process.env.TZ || "Asia/Kolkata", d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d); // YYYY-MM-DD

export function buildEmail(applied: Applied[], to: string, date = dateInTz()) {
  const body = applied
    .map(
      ({ url, match: m }, i) =>
        `${i + 1}. Company: ${m.company}\n   Role: ${m.role}\n   Location: ${m.location}\n   Job URL: ${url}`,
    )
    .join("\n\n");
  return {
    from: process.env.SMTP_USER,
    to,
    subject: `Jobs Applied - ${date}`,
    text: `Applied to ${applied.length} job(s):\n\n${body}\n`,
  };
}

export function makeTransport(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Sends ONE email, and only when there is at least one successful application. */
export async function sendSummary(
  applied: Applied[],
  to: string,
  transport: Pick<Transporter, "sendMail"> = makeTransport(),
): Promise<boolean> {
  if (!applied.length) return false;
  await transport.sendMail(buildEmail(applied, to));
  return true;
}
