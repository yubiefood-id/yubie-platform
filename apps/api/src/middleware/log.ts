/**
 * Structured JSON event logging (observability baseline). Fields carry ids
 * and counters only — never tokens, secrets, or customer PII (no emails,
 * addresses, or free text). Aggregated dashboards can count events; the log
 * lines stay safe to ship anywhere.
 */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...fields, at: new Date().toISOString() }));
}

export function logErrorEvent(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  console.error(JSON.stringify({ level: "error", event, ...fields, at: new Date().toISOString() }));
}
