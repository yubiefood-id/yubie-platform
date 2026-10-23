import { normalizeDeliveryAddress, ok, err, type CustomerAddress, type DeliveryAddressInput, type ErrorCode, type UseCaseResult } from "@yubie/domain";
import type { Clock, IdGenerator, TransactionManager, TransactionalRepositories } from "../ports.js";
import { isCustomerProofValid, type CustomerProof } from "./phone-auth.js";
interface AddressDeps { tx: TransactionManager; clock: Clock; ids: IdGenerator; }
const fail = (code: ErrorCode) => err({ code, message: "Customer address is unavailable or invalid.", retryable: code === "unavailable", requestId: "customer-address" });
function store(repos: TransactionalRepositories) {
  if (!repos.customerAddresses) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
  return repos.customerAddresses;
}
function visible(address: CustomerAddress, now: string): CustomerAddress {
  return { ...address, pin: address.pin && Date.parse(address.pin.expiresAt) > Date.parse(now) ? address.pin : null };
}
async function audit(repos: TransactionalRepositories, action: string, address: CustomerAddress, now: string) {
  const written = await repos.audit.append({ action, resourceType: "customer_address", resourceId: address.id, actor: address.userId, occurredAt: now });
  if (!written.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
}
export async function listCustomerAddresses(input: { actor: CustomerProof }, deps: AddressDeps): Promise<UseCaseResult<CustomerAddress[]>> {
  try { return await deps.tx.run("address.list", async repos => {
    const now = deps.clock.now();
    if (!await isCustomerProofValid(repos, input.actor, now, false)) return fail("unauthorized");
    return ok((await store(repos).list(input.actor.userId)).map(value => visible(value, now)));
  }); } catch { return fail("unavailable"); }
}
export async function saveCustomerAddress(input: { actor: CustomerProof; id?: string; address: { [K in keyof DeliveryAddressInput]?: DeliveryAddressInput[K] | undefined } }, deps: AddressDeps): Promise<UseCaseResult<CustomerAddress>> {
  try { return await deps.tx.run("address.save", async repos => {
    const now = deps.clock.now(), owner = input.actor.userId, addresses = store(repos);
    await addresses.lockOwner(owner);
    if (!await isCustomerProofValid(repos, input.actor, now, false)) return fail("unauthorized");
    const previous = input.id ? await addresses.find(owner, input.id) : null;
    if (input.id && !previous) return fail("not_found");
    const patch = Object.fromEntries(Object.entries(input.address).filter(([, value]) => value !== undefined));
    const normalized = normalizeDeliveryAddress({ ...previous?.address, ...patch } as DeliveryAddressInput); if (!normalized) return fail("validation");
    const owned = await addresses.list(owner);
    if (!previous && owned.length >= 20) return fail("validation");
    const { pin, ...details } = normalized;
    const address: CustomerAddress = {
      id: previous?.id ?? "adr_" + deps.ids.nextId(), userId: owner, address: details,
      pin: input.address.pin === undefined && previous ? previous.pin : pin ? { ...pin, confirmedAt: now, expiresAt: new Date(Date.parse(now) + 30 * 86400_000).toISOString() } : null,
      isDefault: previous?.isDefault ?? owned.length === 0, createdAt: previous?.createdAt ?? now, updatedAt: now,
    };
    const current = visible(address, now);
    await addresses.save(current); await audit(repos, "address.saved", current, now);
    return ok(current);
  }); } catch { return fail("unavailable"); }
}
export async function setDefaultCustomerAddress(input: { actor: CustomerProof; id: string }, deps: AddressDeps): Promise<UseCaseResult<CustomerAddress>> {
  try { return await deps.tx.run("address.default", async repos => {
    const now = deps.clock.now(), addresses = store(repos); await addresses.lockOwner(input.actor.userId);
    if (!await isCustomerProofValid(repos, input.actor, now, false)) return fail("unauthorized");
    const current = await addresses.find(input.actor.userId, input.id); if (!current) return fail("not_found");
    await addresses.clearDefault(input.actor.userId);
    const next = { ...current, isDefault: true, updatedAt: now };
    await addresses.save(next); await audit(repos, "address.default_selected", next, now);
    return ok(visible(next, now));
  }); } catch { return fail("unavailable"); }
}
export async function deleteCustomerAddress(input: { actor: CustomerProof; id: string }, deps: AddressDeps): Promise<UseCaseResult<{ deleted: true }>> {
  try { return await deps.tx.run("address.delete", async repos => {
    const now = deps.clock.now(), addresses = store(repos); await addresses.lockOwner(input.actor.userId);
    if (!await isCustomerProofValid(repos, input.actor, now, false)) return fail("unauthorized");
    const current = await addresses.find(input.actor.userId, input.id); if (!current) return fail("not_found");
    await addresses.remove(input.actor.userId, input.id);
    if (current.isDefault) { const [next] = await addresses.list(input.actor.userId); if (next) await addresses.save({ ...next, isDefault: true, updatedAt: now }); }
    await audit(repos, "address.deleted", current, now);
    return ok({ deleted: true as const });
  }); } catch { return fail("unavailable"); }
}
export async function purgeAddressPins(deps: Pick<AddressDeps, "tx" | "clock">): Promise<void> {
  await deps.tx.run("address.retention", repos => store(repos).purgeExpiredPins(deps.clock.now()));
}
