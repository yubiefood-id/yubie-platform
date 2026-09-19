import postgres from "postgres";

const env = process.env.YUBIE_ENV ?? "development";
if (env === "production" || env === "staging") {
  console.error("Refusing to reset database in production/staging");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function reset() {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql.end();
  console.log("Database reset complete. Run db:migrate and db:seed next.");
}

reset().catch((error) => {
  console.error(error);
  process.exit(1);
});
