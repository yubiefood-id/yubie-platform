import { err } from "@yubie/domain";
import type { AuthSession, UserAccount } from "@yubie/domain";
import type { SessionRepository, UserRepository } from "../ports.js";

const unavailable = () => err({ code: "unavailable", message: "Customer storage is unavailable.", retryable: true, requestId: "identity" });
/** Production absence is explicit; these repositories never retain customer data. */
export class UnavailableUserRepository implements UserRepository {
  async findById(_id: string) { return unavailable(); }
  async findByGoogleSub(_subject: string) { return unavailable(); }
  async save(_user: UserAccount) { return unavailable(); }
}
export class UnavailableSessionRepository implements SessionRepository {
  async findByTokenHash(_hash: string) { return unavailable(); }
  async listForUser(_id: string) { return unavailable(); }
  async save(_session: AuthSession) { return unavailable(); }
}
