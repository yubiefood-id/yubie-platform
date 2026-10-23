import type { CustomerAddress } from "@yubie/domain";
/** Every lookup/mutation carries the owner; bound to the enclosing transaction. */
export interface CustomerAddressRepository {
  lockOwner(userId: string): Promise<void>;
  list(userId: string): Promise<CustomerAddress[]>;
  find(userId: string, id: string): Promise<CustomerAddress | null>;
  save(address: CustomerAddress): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
  clearDefault(userId: string): Promise<void>;
  purgeExpiredPins(now: string): Promise<void>;
}
