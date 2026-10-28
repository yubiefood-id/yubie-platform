import { canOperate, type StaffRole } from "@yubie/domain";
export type AdminRole = StaffRole;


/**
 * Deny by default. Refine accessControlProvider is not this function.
 * Every admin route must call authorize on the server before it reads data.
 */
export function authorize(role: AdminRole, method: string, path: string): "allow" | "deny" {
  if (method !== "GET" && method !== "HEAD") return "deny";
  if (path === "/v1/orders" && canOperate([role],"orders:read")) return "allow";
  if (path === "/v1/payments" && canOperate([role],"payments:read")) return "allow";
  if (path === "/v1/exceptions" && canOperate([role],"exceptions:read")) return "allow";
  if (path === "/v1/inventory" && canOperate([role],"inventory:read")) return "allow";
  return "deny";
}
