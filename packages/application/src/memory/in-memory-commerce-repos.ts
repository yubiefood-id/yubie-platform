import { ok } from "@yubie/domain";
import type { AuthSession, OrderRecord, PaymentEventRecord, PaymentRecord, UserAccount } from "@yubie/domain";
import type {
  OrderRepository,
  PaymentEventAppendOutcome,
  PaymentEventRepository,
  PaymentRepository,
  SessionRepository,
  UserRepository,
} from "../ports.js";
import { DuplicatePaymentIntentError } from "../ports.js";

export class InMemoryOrderRepository implements OrderRepository {
  private readonly items = new Map<string, OrderRecord>();

  async findById(id: string) {
    return ok(this.items.get(id) ?? null);
  }

  async findByCheckoutRef(checkoutRef: string) {
    return ok([...this.items.values()].find((item) => item.checkoutRef === checkoutRef) ?? null);
  }

  async findByPublicToken(token: string) {
    return ok([...this.items.values()].find((item) => item.checkoutPublicToken === token) ?? null);
  }

  async listForUser(userId: string) {
    return ok([...this.items.values()].filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async listStaleDrafts(olderThan: string, limit: number) {
    return ok(
      [...this.items.values()]
        .filter((item) => item.status === "draft" && item.createdAt < olderThan)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit),
    );
  }

  snapshot(): () => void {
    const saved = new Map(this.items);
    return () => {
      this.items.clear();
      for (const [id, item] of saved) this.items.set(id, item);
    };
  }

  async save(order: OrderRecord) {
    this.items.set(order.id, order);
    return ok(undefined);
  }
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly items = new Map<string, PaymentRecord>();

  async findById(id: string) {
    return ok(this.items.get(id) ?? null);
  }

  /** No real locking in memory; parity with the Postgres port shape. */
  async lockById(id: string) {
    return ok(this.items.get(id) ?? null);
  }

  async findByProviderSession(provider: string, providerSessionId: string) {
    return ok(
      [...this.items.values()].find((item) => item.provider === provider && item.providerSessionId === providerSessionId) ?? null,
    );
  }

  async findByOrderId(orderId: string) {
    return ok([...this.items.values()].filter((item) => item.orderId === orderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async findUnresolvedByPrincipalHash(principalKey: string, requestHash: string) {
    return ok(
      [...this.items.values()].find((item) =>
        item.status === "pending" && item.principalKey === principalKey && item.requestHash === requestHash,
      ) ?? null,
    );
  }

  async listPendingExpired(now: string, limit: number) {
    return ok(
      [...this.items.values()]
        .filter((item) => item.status === "pending" && item.expiresAt !== null && item.expiresAt < now)
        .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""))
        .slice(0, limit),
    );
  }

  snapshot(): () => void {
    const saved = new Map(this.items);
    return () => {
      this.items.clear();
      for (const [id, item] of saved) this.items.set(id, item);
    };
  }

  async save(payment: PaymentRecord) {
    if (payment.status === "pending" && payment.principalKey && payment.requestHash) {
      const clash = [...this.items.values()].some((item) =>
        item.id !== payment.id && item.status === "pending" && item.principalKey === payment.principalKey && item.requestHash === payment.requestHash,
      );
      if (clash) throw new DuplicatePaymentIntentError();
    }
    this.items.set(payment.id, payment);
    return ok(undefined);
  }
}

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly dedupeKeys = new Set<string>();
  readonly events: PaymentEventRecord[] = [];

  async recordOnce(event: PaymentEventRecord): Promise<{ ok: true; value: PaymentEventAppendOutcome }> {
    if (this.dedupeKeys.has(event.dedupeKey)) return ok("duplicate");
    this.dedupeKeys.add(event.dedupeKey);
    this.events.push(event);
    return ok("inserted");
  }

  async listForPayment(paymentId: string) {
    return ok(this.events.filter((event) => event.paymentId === paymentId));
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly items = new Map<string, UserAccount>();

  async findByGoogleSub(googleSub: string) {
    return ok([...this.items.values()].find((item) => item.googleSub === googleSub) ?? null);
  }

  async findById(id: string) {
    return ok(this.items.get(id) ?? null);
  }

  async save(user: UserAccount) {
    this.items.set(user.id, user);
    return ok(undefined);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly items = new Map<string, AuthSession>();

  async findByTokenHash(tokenHash: string) {
    return ok([...this.items.values()].find((item) => item.tokenHash === tokenHash) ?? null);
  }

  async save(session: AuthSession) {
    this.items.set(session.id, session);
    return ok(undefined);
  }

  async listForUser(userId: string) {
    return ok([...this.items.values()].filter((item) => item.userId === userId));
  }
}
