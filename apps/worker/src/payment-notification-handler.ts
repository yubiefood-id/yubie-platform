import {processPaymentNotification,SystemClock,CryptoIdGenerator} from "@yubie/application";
import {createCommercePaymentProvider} from "@yubie/integrations";
import {PostgresPaymentNotificationInbox,PostgresTransactionManager,type Database} from "@yubie/persistence";
import {increment,setGauge} from "./metrics.js";

export async function runPaymentNotifications(database:Database) {
  if(process.env.COMMERCE_PROVIDER!=="ipaymu")return;
  const provider=createCommercePaymentProvider(process.env);const merchant=process.env.IPAYMU_VA;
  if(!provider||!merchant)throw new Error("Payment callback provider unavailable");
  const inbox=new PostgresPaymentNotificationInbox(database);
  for(const item of await inbox.claim()){
    try{
      const outcome=await processPaymentNotification(item.notification,{provider,merchant,tx:new PostgresTransactionManager(database),clock:new SystemClock(),ids:new CryptoIdGenerator()});
      await inbox.finish(item.id,outcome.terminal,outcome.outcome==="rejected"||outcome.outcome==="exception"?outcome.reason??outcome.outcome:null);
      increment("payment_notification_"+outcome.outcome+"_total");
      console.log(JSON.stringify({level:outcome.outcome==="rejected"||outcome.outcome==="exception"?"error":"info",event:"worker.payment_notification",inboxId:item.id,outcome:outcome.outcome,...("reason" in outcome?{reason:outcome.reason}:{}),at:new Date().toISOString()}));
    }catch{
      await inbox.finish(item.id,false);increment("payment_notification_failures_total");
    }
  }
  const [pending]=await database.client`SELECT count(*)::integer AS count,coalesce(extract(epoch FROM now()-min(received_at)),0)::integer AS age FROM payment_notification_inbox WHERE processed_at IS NULL`;
  setGauge("payment_notification_pending_count",Number(pending?.count??0));
  setGauge("payment_notification_oldest_age_seconds",Number(pending?.age??0));
}
