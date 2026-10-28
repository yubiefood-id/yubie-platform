import { reconcileIpaymuPayment, SystemClock, CryptoIdGenerator } from "@yubie/application";
import { createCommercePaymentProvider } from "@yubie/integrations";
import { PostgresTransactionManager, type Database } from "@yubie/persistence";
export async function runOperationsPaymentReconcile(database: Database, paymentId: string) {
  if (process.env.COMMERCE_PROVIDER !== "ipaymu" || !process.env.IPAYMU_VA) throw new Error("Operations payment provider unavailable");
  const provider = createCommercePaymentProvider(process.env);
  if (!provider) throw new Error("Operations payment provider unavailable");
  await reconcileIpaymuPayment(paymentId, { tx: new PostgresTransactionManager(database), provider, merchant: process.env.IPAYMU_VA, clock: new SystemClock(), ids: new CryptoIdGenerator() });
}
