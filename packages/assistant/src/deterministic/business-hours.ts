export interface BusinessHoursConfig {
  timezone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  weekdays: number[];
}

const DEFAULT_CONFIG: BusinessHoursConfig = {
  timezone: "Asia/Jakarta",
  openHour: 9,
  openMinute: 0,
  closeHour: 17,
  closeMinute: 0,
  weekdays: [1, 2, 3, 4, 5],
};

function parseConfig(raw: string): BusinessHoursConfig {
  const parsed = JSON.parse(raw) as Partial<BusinessHoursConfig> & { weekdays?: number[] };
  return {
    timezone: parsed.timezone ?? DEFAULT_CONFIG.timezone,
    openHour: parsed.openHour ?? DEFAULT_CONFIG.openHour,
    openMinute: parsed.openMinute ?? DEFAULT_CONFIG.openMinute,
    closeHour: parsed.closeHour ?? DEFAULT_CONFIG.closeHour,
    closeMinute: parsed.closeMinute ?? DEFAULT_CONFIG.closeMinute,
    weekdays: parsed.weekdays ?? DEFAULT_CONFIG.weekdays,
  };
}

export function loadBusinessHoursConfig(): BusinessHoursConfig {
  const raw = process.env.YUBIE_BUSINESS_HOURS_JSON;
  if (!raw) return DEFAULT_CONFIG;
  try {
    return parseConfig(raw);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdayMap[weekday] ?? 1, hour, minute };
}

export function isWithinBusinessHours(at = new Date(), config = loadBusinessHoursConfig()): boolean {
  const { weekday, hour, minute } = zonedParts(at, config.timezone);
  if (!config.weekdays.includes(weekday)) return false;
  const nowMinutes = hour * 60 + minute;
  const openMinutes = config.openHour * 60 + config.openMinute;
  const closeMinutes = config.closeHour * 60 + config.closeMinute;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function selectHandoffTemplateId(
  at = new Date(),
  config = loadBusinessHoursConfig(),
): "handoff.in_hours.v1" | "handoff.after_hours.v1" {
  return isWithinBusinessHours(at, config) ? "handoff.in_hours.v1" : "handoff.after_hours.v1";
}
