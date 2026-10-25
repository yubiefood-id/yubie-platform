import {sql} from "drizzle-orm";
import {randomUUID} from "node:crypto";
import type {PaymentNotificationInbox,VerifiedPaymentNotification} from "@yubie/application";
import type {Database} from "../client.js";

export class PostgresPaymentNotificationInbox implements PaymentNotificationInbox {
  constructor(private readonly database:Database){}
  async receive(notification:VerifiedPaymentNotification):Promise<"received"|"duplicate"> {
    const rows=await this.database.db.execute(sql`INSERT INTO payment_notification_inbox(id,dedupe_key,notification) VALUES(${"pni_"+randomUUID()},${notification.payloadHash},${JSON.stringify(notification)}::jsonb) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`);
    return rows.length?"received":"duplicate";
  }
  async claim() {
    const rows=await this.database.client`UPDATE payment_notification_inbox SET retry_after=now()+interval '60 seconds',attempt_count=attempt_count+1 WHERE id IN (SELECT id FROM payment_notification_inbox WHERE processed_at IS NULL AND retry_after<=now() ORDER BY received_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING id,notification`;
    return rows.map(row=>({id:String(row.id),notification:row.notification as VerifiedPaymentNotification}));
  }
  async finish(id:string,terminal:boolean,errorCode:string|null=null) {
    if(terminal)await this.database.client`UPDATE payment_notification_inbox SET processed_at=now(),last_error_code=${errorCode} WHERE id=${id}`;
    else await this.database.client`UPDATE payment_notification_inbox SET retry_after=now()+interval '60 seconds',last_error_code='AUTHORITATIVE_LOOKUP_PENDING' WHERE id=${id}`;
  }
}
