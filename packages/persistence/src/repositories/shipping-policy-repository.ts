import { sql } from "drizzle-orm";
import type { Database } from "../client.js";

export class PostgresShippingPolicyRepository {
  constructor(private readonly database: Database) {}
  async authorize(city: string, now: string) {
    if (!city.trim()) return null;
    const rows = await this.database.db.execute(sql`SELECT id,approval_ref FROM shipping_policy_approvals WHERE scope='whole_city' AND policy='free_promotional' AND length(trim(service_coverage))>0 AND length(trim(cost_owner))>0 AND length(trim(approval_ref))>0 AND length(trim(approved_by))>0 AND starts_at<=${now}::timestamptz AND ends_at>${now}::timestamptz AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(cities) AS covered(city) WHERE lower(trim(covered.city))=lower(trim(${city}))) ORDER BY starts_at DESC LIMIT 1 FOR SHARE`);
    return rows[0]?{policy:"free_promotional" as const,amount:0,reason:`Approved shipping policy ${rows[0].id}`}:null;
  }
  /** Public active coverage: exact city strings customers can be offered, deduplicated case-insensitively (first spelling wins). No approval metadata is exposed. */
  async listCoverage(now: string): Promise<{ policy: "free_promotional"; amount: number; cities: string[] }[]> {
    const rows = await this.database.db.execute(sql`SELECT cities FROM shipping_policy_approvals WHERE scope='whole_city' AND policy='free_promotional' AND length(trim(service_coverage))>0 AND length(trim(cost_owner))>0 AND length(trim(approval_ref))>0 AND length(trim(approved_by))>0 AND starts_at<=${now}::timestamptz AND ends_at>${now}::timestamptz ORDER BY starts_at DESC`);
    const cities: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const list = Array.isArray((row as { cities?: unknown }).cities) ? (row as { cities: unknown[] }).cities : [];
      for (const value of list) {
        if (typeof value !== "string") continue;
        const city = value.trim();
        if (city.length < 2 || city.length > 80) continue;
        const key = city.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cities.push(city);
      }
    }
    return cities.length ? [{ policy: "free_promotional", amount: 0, cities }] : [];
  }
}
