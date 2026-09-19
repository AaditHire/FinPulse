import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

import { sendAlertEmail } from "@/lib/email";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv("SMTP_USER", "sender@example.com");
  vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");
  vi.stubEnv("EMAIL_TO", "recipient@example.com");
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
});

it("normalizes spaces in a Google App Password", async () => {
  mocks.sendMail.mockResolvedValue({ messageId: "message-1" });

  await sendAlertEmail("Subject", "Body");

  expect(mocks.createTransport).toHaveBeenCalledWith({ service: "gmail", auth: { user: "sender@example.com", pass: "abcdefghijklmnop" } });
});

it("replaces Gmail authentication details with an actionable safe error", async () => {
  mocks.sendMail.mockRejectedValue(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"));

  await expect(sendAlertEmail("Subject", "Body")).rejects.toThrow("Replace SMTP_PASS with a current 16-character Google App Password");
});
