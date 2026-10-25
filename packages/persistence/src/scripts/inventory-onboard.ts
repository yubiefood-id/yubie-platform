import { readFile } from "node:fs/promises";
import { inventoryOnboardingSchema } from "@yubie/validation";
import { createDatabase, closeDatabase } from "../client.js";
import { PostgresInventoryOnboarding } from "../repositories/inventory-onboarding.js";

async function main() {
  const args=process.argv.slice(2);const file=args[0];const apply=args.includes("--apply");
  if(!file||!process.env.DATABASE_URL)throw new Error("Provide a protected input JSON path and DATABASE_URL; default is dry-run");
  if(apply&&(!args.includes("--confirm-count")||process.env.YUBIE_CHECKOUT_ADMISSION!=="disabled"))throw new Error("Apply requires --confirm-count and disabled checkout admission");
  const parsed=inventoryOnboardingSchema.safeParse(JSON.parse(await readFile(file,"utf8")));
  if(!parsed.success)throw new Error("Count input is incomplete or invalid; supply real packaging, count, lot, expiry and release evidence");
  const database=createDatabase(process.env.DATABASE_URL);
  try {console.log(JSON.stringify(await new PostgresInventoryOnboarding(database).run(parsed.data,apply),null,2));}
  finally {await closeDatabase(database);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Inventory onboarding failed");process.exitCode=1;});
