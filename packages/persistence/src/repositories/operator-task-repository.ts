import { randomUUID } from "node:crypto";
import { ok } from "@yubie/domain";
import type { OperatorTaskRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { operatorTasks } from "../schema/index.js";


export class PostgresOperatorTaskRepository implements OperatorTaskRepository {
  constructor(private readonly database: Database) {}

  async create(task: { type: string; status: string; priority: number; listingKey?: string; details?: string; createdAt: string }) {
    await this.database.db.insert(operatorTasks).values({
      id: `task_${randomUUID()}`,
      type: task.type,
      status: task.status as "open",
      priority: task.priority,
      listingKey: task.listingKey ?? null,
      details: task.details ?? null,
      createdAt: task.createdAt,
    });
    return ok(undefined);
  }
}
