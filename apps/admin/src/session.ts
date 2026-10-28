import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdminRole } from "./rbac.js";
import { STAFF_ROLES } from "@yubie/domain";

export interface AdminSession {
  sub: string;
  role: AdminRole;
  exp: number;
}

const ROLES: ReadonlySet<string> = new Set(STAFF_ROLES);

export function issueAdminSession(session: AdminSession, secret: string): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readAdminSession(token: string, secret: string, nowMs: number): AdminSession | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AdminSession>;
    if (typeof parsed.sub !== "string" || parsed.sub.length === 0) return null;
    if (typeof parsed.role !== "string" || !ROLES.has(parsed.role)) return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= nowMs) return null;
    return { sub: parsed.sub, role: parsed.role as AdminRole, exp: parsed.exp };
  } catch {
    return null;
  }
}
