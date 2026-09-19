import { ok } from "@yubie/domain";
import type { OperatorTaskRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { operatorTasks } from "../schema/index.js";

let taskCounter = 0;

export class PostgresOperatorTaskRepository implements OperatorTaskRepository {
  constructor(private readonly database: Database) {}

  async create(task: { type: string; status: string; priority: number; listingKey?: string; details?: string; createdAt: string }) {
    taskCounter += 1;
    await this.database.db.insert(operatorTasks).values({
      id: `task-${taskCounter}`,
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
