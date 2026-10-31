import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const SettingsSchema = z.object({
  noticePeriod: z.string(),
  expectedSalary: z.string(),
  currentSalary: z.string().default(""),
  preferredCities: z.array(z.string()),
  hybridOk: z.boolean(),
  holdingOffer: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function loadSettings(file = path.resolve("config/settings.json")): Settings {
  return SettingsSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
