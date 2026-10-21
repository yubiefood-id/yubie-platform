/** Return navigation stays on this origin, including URL-parser edge cases. */
export function safeLoginReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/account";
  try {
    const base = "https://yubie.invalid";
    const target = new URL(value, base);
    return target.origin === base ? target.pathname + target.search + target.hash : "/account";
  } catch { return "/account"; }
}
