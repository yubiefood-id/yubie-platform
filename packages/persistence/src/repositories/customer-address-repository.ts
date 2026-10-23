import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { CustomerAddress } from "@yubie/domain";
import type { CustomerAddressRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { customerAddresses } from "../schema/index.js";
function record(row: typeof customerAddresses.$inferSelect): CustomerAddress {
  return { id: row.id, userId: row.userId, address: row.address, pin: row.pin, isDefault: row.isDefault, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
export class PostgresCustomerAddressRepository implements CustomerAddressRepository {
  constructor(private readonly database: Database) {}
  async lockOwner(userId: string): Promise<void> { await this.database.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"addresses:" + userId},0))`); }
  async list(userId: string): Promise<CustomerAddress[]> {
    return (await this.database.db.select().from(customerAddresses).where(eq(customerAddresses.userId, userId)).orderBy(asc(customerAddresses.createdAt), asc(customerAddresses.id)).limit(21)).map(record);
  }
  async find(userId: string, id: string): Promise<CustomerAddress | null> {
    const [row] = await this.database.db.select().from(customerAddresses).where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.id, id))).limit(1); return row ? record(row) : null;
  }
  async save(address: CustomerAddress): Promise<void> {
    const values = { ...address, pinExpiresAt: address.pin?.expiresAt ?? null };
    const rows = await this.database.db.insert(customerAddresses).values(values).onConflictDoUpdate({ target: customerAddresses.id, set: values, setWhere: eq(customerAddresses.userId, address.userId) }).returning({ id: customerAddresses.id });
    if (rows.length !== 1) throw new Error("ADDRESS_WRITE_REJECTED");
  }
  async remove(userId: string, id: string): Promise<void> { await this.database.db.delete(customerAddresses).where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.id, id))); }
  async clearDefault(userId: string): Promise<void> { await this.database.db.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.userId, userId)); }
  async purgeExpiredPins(now: string): Promise<void> { await this.database.db.update(customerAddresses).set({ pin: null, pinExpiresAt: null }).where(lte(customerAddresses.pinExpiresAt, now)); }
}
