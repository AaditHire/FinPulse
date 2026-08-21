import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type DigestSettings = {
  recipient: string;
  deliveryTime: string;
  timezone: string;
  enabled: boolean;
};

const settingsPath = process.env.FINPULSE_SETTINGS_PATH
  ?? path.resolve(process.cwd(), "..", "data", "digest-settings.json");
const schedulePath = path.resolve(process.cwd(), "..", "agent", "digest_schedule.json");

const defaults: DigestSettings = {
  recipient: process.env.EMAIL_TO?.trim() ?? "",
  deliveryTime: "08:00",
  timezone: "Asia/Kolkata",
  enabled: true,
};

export async function readDigestSettings(): Promise<DigestSettings> {
  try {
    const saved = JSON.parse(await readFile(/* turbopackIgnore: true */ settingsPath, "utf8")) as Partial<DigestSettings>;
    return {
      recipient: typeof saved.recipient === "string" ? saved.recipient : defaults.recipient,
      deliveryTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved.deliveryTime ?? "") ? saved.deliveryTime! : defaults.deliveryTime,
      timezone: typeof saved.timezone === "string" ? saved.timezone : defaults.timezone,
      enabled: typeof saved.enabled === "boolean" ? saved.enabled : defaults.enabled,
    };
  } catch {
    return defaults;
  }
}

export async function writeDigestSettings(settings: DigestSettings): Promise<void> {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await writeFile(schedulePath, `${JSON.stringify({
    delivery_time: settings.deliveryTime,
    timezone: settings.timezone,
    enabled: settings.enabled,
  }, null, 2)}\n`, "utf8");
}
