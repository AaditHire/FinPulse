import nodemailer from "nodemailer";
import "server-only";

export async function sendAlertEmail(subject: string, text: string, recipient?: string) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  const to = recipient ?? process.env.EMAIL_TO;
  if (!user || !pass || !to) throw new Error("SMTP alert delivery is not configured.");
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  try {
    await transport.sendMail({ from: `FinPulse <${user}>`, to, subject, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\b535\b|EAUTH|username and password not accepted/i.test(message)) {
      throw new Error("Gmail rejected the sender credentials. Replace SMTP_PASS with a current 16-character Google App Password.");
    }
    throw new Error("Email delivery failed. Check the server mail configuration and try again.");
  }
}
