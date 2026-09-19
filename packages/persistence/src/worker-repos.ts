import { PostgresListingHealthRepository } from "./repositories/listing-health-repository.js";
import { PostgresMarketplaceListingRepository } from "./repositories/marketplace-listing-repository.js";
import { PostgresOperatorTaskRepository } from "./repositories/operator-task-repository.js";
import { createDatabase, type Database } from "./client.js";

export function createWorkerRepositories(databaseUrl: string) {
  const database = createDatabase(databaseUrl);
  return {
    database,
    listings: new PostgresMarketplaceListingRepository(database),
    health: new PostgresListingHealthRepository(database),
    tasks: new PostgresOperatorTaskRepository(database),
  };
}

export type WorkerRepositories = ReturnType<typeof createWorkerRepositories> & { database: Database };
