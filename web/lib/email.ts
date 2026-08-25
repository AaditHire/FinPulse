import nodemailer from "nodemailer";
import "server-only";

export async function sendAlertEmail(subject: string, text: string, recipient?: string) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = recipient ?? process.env.EMAIL_TO;
  if (!user || !pass || !to) throw new Error("SMTP alert delivery is not configured.");
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({ from: `FinPulse <${user}>`, to, subject, text });
}
