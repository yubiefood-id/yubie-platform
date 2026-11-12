// Minimal PII redaction for diagnostic/audit storage (AGENTS.md §6): phone
// numbers and emails are stripped before text enters logs or audit rows.
// Intentionally conservative: standalone digit runs ≥10 digits and Indonesian
// mobile patterns are masked; prefixed ids (e.g. "outbox-…") are untouched.
export function redactForLog(text: string): string {
  return text
    .replace(/(?:\+62|62|0)8\d{7,12}/g, "[telepon]")
    .replace(/(^|[^A-Za-z0-9-])(\+?\d[\d\s.-]{8,16}\d)(?=[^A-Za-z0-9-]|$)/g, (_m, lead) => `${lead}[nomor]`)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .slice(0, 2000);
}
