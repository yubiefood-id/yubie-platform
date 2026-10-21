export type AdminRole = "viewer" | "operator" | "finance";

const ORDER_READ: ReadonlySet<AdminRole> = new Set(["viewer", "operator", "finance"]);
const PAYMENT_READ: ReadonlySet<AdminRole> = new Set(["operator", "finance"]);

/**
 * Deny by default. Refine accessControlProvider is not this function.
 * Every admin route must call authorize on the server before it reads data.
 */
export function authorize(role: AdminRole, method: string, path: string): "allow" | "deny" {
  if (method !== "GET" && method !== "HEAD") return "deny";
  if (path === "/v1/orders" && ORDER_READ.has(role)) return "allow";
  if (path === "/v1/payments" && PAYMENT_READ.has(role)) return "allow";
  if (path === "/v1/exceptions" && PAYMENT_READ.has(role)) return "allow";
  if (path === "/v1/inventory" && ORDER_READ.has(role)) return "allow";
  return "deny";
}
