import { CryptoIdGenerator, CryptoSessionTokenService, OtpCryptography, SystemClock, dispatchPhoneChallenges } from "@yubie/application";
import { isDirectCommerceProfile, parseIdentityRuntimeConfig, parseLaunchProfile, type RuntimeEnvSource } from "@yubie/config";
import { SmsgateOtpDelivery } from "@yubie/integrations";
import { PostgresTransactionManager, type Database } from "@yubie/persistence";

/** The durable challenge table is the delivery authority; queue ticks only wake it. */
export async function runPhoneDelivery(database: Database, env: RuntimeEnvSource = process.env): Promise<void> {
  if (!isDirectCommerceProfile(parseLaunchProfile(env.YUBIE_LAUNCH_PROFILE))) return;
  const config = parseIdentityRuntimeConfig(env, "worker");
  if (!config) return;
  await dispatchPhoneChallenges({
    tx: new PostgresTransactionManager(database), clock: new SystemClock(),
    ids: new CryptoIdGenerator(), tokens: new CryptoSessionTokenService(),
    crypto: new OtpCryptography({ hashKey: config.hashSecret, encryptionKey: config.encryptionKey }),
    allowedCountries: config.allowedCountries, delivery: new SmsgateOtpDelivery(config.smsgate),
  });
}
