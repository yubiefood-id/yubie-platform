import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

export interface NormalizedPhone { e164: string; country: string | null; }

/** No text extraction, extensions or hand-written trunk/country guessing. */
export function normalizePhone(raw: string, country = "ID"): NormalizedPhone | null {
  if (typeof raw !== "string" || raw.length > 40 || !/^\+?[\d\s().-]+$/.test(raw.trim())) return null;
  try {
    const parsed = parsePhoneNumberFromString(raw.trim(), { defaultCountry: country as CountryCode, extract: false });
    return parsed?.isValid() && !parsed.ext ? { e164: parsed.number, country: parsed.country ?? null } : null;
  } catch { return null; }
}
