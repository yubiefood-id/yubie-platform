import { eq, sql } from "drizzle-orm";
import type { SupportConversationProvider, SupportThreadRef, ProviderSendResult } from "@yubie/application";
import { buildHandoffCommand } from "@yubie/integrations";
import { deriveYubiCapabilities, parseLaunchProfile } from "@yubie/config";
import { assistantOutbox, PostgresAssistantOutboxRepository, PostgresConversationSessionRepository, PostgresRuntimeConfigRepository, type Database } from "@yubie/persistence";
import { increment, setGauge } from "./metrics.js";

function threadRefFromRow(row: {provider:string;providerThreadId:string|null;conversationRef:string}): SupportThreadRef {
  return {provider:row.provider as SupportThreadRef["provider"],threadId:row.providerThreadId??row.conversationRef};
}
const RETRY_DELAYS=[30_000,120_000,600_000,1_800_000];

async function mediaFallback(database: Database,row: typeof assistantOutbox.$inferSelect,payload: Record<string,unknown>) {
  if(typeof payload.fallbackText!=="string")return;
  await database.db.transaction(async tx=>{
    const bound={db:tx,client:database.client} as unknown as Database;
    const repo=new PostgresAssistantOutboxRepository(bound);
    await repo.updateStatus(row.id,"failed",{lastError:"media_rejected"},new Date().toISOString());
    await repo.enqueue({provider:row.provider,providerThreadId:row.providerThreadId??row.conversationRef,conversationRef:row.conversationRef,actionType:"reply",payloadFingerprint:row.payloadFingerprint+":fallback",payloadJson:JSON.stringify({content:payload.fallbackText,customerReceivedAt:payload.customerReceivedAt,requires:payload.requires}),createdAt:new Date().toISOString()});
  });
  increment("product_media_failed_total");
  console.log(JSON.stringify({event:"product_media_failed",correlationId:row.id,errorCode:"MEDIA_REJECTED"}));
}

export async function deliverSupportOutbox(database: Database,support: SupportConversationProvider,outboxId: string,alreadyClaimed=false) {
  const repo=new PostgresAssistantOutboxRepository(database);
  const rows=alreadyClaimed?await database.db.select().from(assistantOutbox).where(eq(assistantOutbox.id,outboxId)).limit(1):await repo.claimPending(1,outboxId);
  const row=rows[0];if(!row || row.status!=="delivering")return;
  const now=new Date().toISOString();
  const ref=threadRefFromRow(row);
  const terminal=async(status:"failed"|"cancelled",code:string)=>repo.updateStatus(row.id,status,{lastError:code},now);
  let payload: Record<string,unknown>;
  try {payload=JSON.parse(row.payloadJson) as Record<string,unknown>;}catch{await terminal("failed","invalid_payload");return;}
  try {
    const runtime=await new PostgresRuntimeConfigRepository(database).getSnapshot();
    let result: ProviderSendResult;
    if(row.actionType==="handoff") {
      // Safety internal routing is explicitly allowed while customer automation is OFF.
      if((!runtime.assistantEnabled || runtime.mode==="off") && payload.intent!=="FOOD_SAFETY"){await terminal("cancelled","automation_off");return;}
      const command=buildHandoffCommand(ref,(payload.intent??"HUMAN_REQUEST") as import("@yubie/domain").AssistantIntent,typeof payload.handoffReason==="string"?payload.handoffReason:undefined,{...(payload.flowVersion==="deterministic-v2"?{flowVersion:"deterministic-v2" as const}:{}),...(typeof payload.productId==="string"?{productId:payload.productId}:{})});
      if(payload.summary && typeof payload.summary==="object")command.summary=payload.summary as Record<string,unknown>;
      command.idempotencyKey=row.payloadFingerprint;
      result=await support.handoff(command);
      if(result.ok) {
        await repo.updateStatus(row.id,"delivered",{deliveredAt:now},now);
        await database.db.execute(sql`UPDATE assistant_outbox SET payload_json=(payload_json::jsonb - 'summary')::text WHERE id=${row.id}`);
        await database.db.execute(sql`UPDATE conversation_sessions SET state='QUEUED',updated_at=${now} WHERE provider=${ref.provider} AND provider_thread_id=${ref.threadId} AND state='HANDOFF_REQUESTED'`);
        return;
      }
    } else {
      if(!runtime.assistantEnabled || runtime.mode!=="auto"){await terminal("cancelled","automation_not_auto");return;}
      const sessions=new PostgresConversationSessionRepository(database);
      const local=await sessions.getByProviderThreadId(ref.provider,ref.threadId);
      const state=local.ok?local.value?.state:undefined;
      if(state && ["HUMAN_ACTIVE","RESOLVED","QUEUED","HANDOFF_REQUESTED"].includes(state) && !(payload.handoffReceipt && ["QUEUED","HANDOFF_REQUESTED"].includes(state))){await terminal("cancelled","human_takeover");return;}
      const caps=deriveYubiCapabilities(parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE),runtime.websiteRelease,process.env.YUBIE_ENV??"development");
      if(Array.isArray(payload.requires) && payload.requires.some(k=>typeof k!=="string" || !caps[k as keyof typeof caps])){await terminal("cancelled","capability_revoked");return;}
      // This is the customer dispatch boundary: no customer article is posted before these fresh checks.
      const human=await support.getCurrentHumanState(ref);
      if(human.humanActive || (human.automationDisabled && !payload.handoffReceipt)){await terminal("cancelled","human_takeover");return;}
      if(ref.provider==="zammad") {
        const last=Date.parse(human.lastCustomerAt??String(payload.customerReceivedAt??""));
        if(!Number.isFinite(last) || last>Date.now()+60_000 || Date.now()-last>=24*60*60*1000 || human.serviceWindowOpen===false){await terminal("cancelled","service_window_closed");return;}
      }
      const authorizeDispatch=async()=>{
        const fresh=await new PostgresRuntimeConfigRepository(database).getSnapshot();
        const current=await sessions.getByProviderThreadId(ref.provider,ref.threadId);
        const currentState=current.ok?current.value?.state:undefined;
        if(!fresh.assistantEnabled || fresh.mode!=="auto" || currentState==="HUMAN_ACTIVE" || currentState==="RESOLVED")return false;
        const latestCaps=deriveYubiCapabilities(parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE),fresh.websiteRelease,process.env.YUBIE_ENV??"development");
        return !Array.isArray(payload.requires) || !payload.requires.some(k=>!latestCaps[k as keyof typeof latestCaps]);
      };
      if(row.actionType==="product_media") {
        result=support.sendProductMedia?await support.sendProductMedia({threadRef:ref,productId:String(payload.productId),assetId:String(payload.assetId),caption:String(payload.caption),websiteUrl:String(payload.websiteUrl),idempotencyKey:row.payloadFingerprint,correlationId:row.id,authorizeDispatch}):{ok:false,code:"VALIDATION_ERROR"};
        if(!result.ok && result.code==="VALIDATION_ERROR"){await mediaFallback(database,row,payload);return;}
      } else if(row.actionType==="reply" && typeof payload.content==="string" && payload.content.length>0 && payload.content.length<=4096) {
        result=await support.sendReply({threadRef:ref,content:payload.content,idempotencyKey:row.payloadFingerprint,authorizeDispatch,handoffReceipt:payload.handoffReceipt===true});
      } else {await terminal("failed","invalid_action");return;}
      if(result.ok){await repo.updateStatus(row.id,ref.provider==="fake"?"delivered":"accepted",{...(result.providerMessageId?{providerMessageId:result.providerMessageId}:{}),nextAttemptAt:new Date(Date.now()+30_000).toISOString()},now);return;}
    }
    if(!result.ok) {
      increment("support_provider_error_total");
      if(result.code==="TIMEOUT" || result.code==="AMBIGUOUS"){await repo.updateStatus(row.id,"ambiguous",{lastError:result.code,nextAttemptAt:new Date(Date.now()+30_000).toISOString()},now);return;}
      if(["UNAUTHORIZED","FORBIDDEN","NOT_FOUND","VALIDATION_ERROR"].includes(result.code) || row.attemptCount>=5){await terminal("failed",result.code);return;}
      await repo.updateStatus(row.id,"retry",{lastError:result.code,nextAttemptAt:new Date(Date.now()+RETRY_DELAYS[Math.min(row.attemptCount-1,3)]!).toISOString()},now);
    }
  } catch {
    // A transport exception after dispatch may have created an article. Never blindly resend.
    await repo.updateStatus(row.id,"ambiguous",{lastError:"PROVIDER_OUTCOME_UNKNOWN",nextAttemptAt:new Date(Date.now()+30_000).toISOString()},now);
    increment("support_provider_error_total");
  }
}

export async function reconcileOutbound(database: Database,support: SupportConversationProvider) {
  if(!support.getOutboundStatus)return;
  const repo=new PostgresAssistantOutboxRepository(database);
  const rows=await database.db.select().from(assistantOutbox).where(sql`${assistantOutbox.provider}=${support.provider} AND ${assistantOutbox.status} IN ('accepted','sent','ambiguous') AND (${assistantOutbox.nextAttemptAt} IS NULL OR ${assistantOutbox.nextAttemptAt}<=now())`).limit(20);
  for(const row of rows) {
    if(row.actionType==="handoff")continue; // Operator reconciles an uncertain multi-step routing change.
    try {
      const status=await support.getOutboundStatus(threadRefFromRow(row),row.payloadFingerprint);
      const now=new Date().toISOString();
      if(status.state==="failed") {
        if(row.actionType==="product_media")await mediaFallback(database,row,JSON.parse(row.payloadJson));
        else await repo.updateStatus(row.id,"failed",{lastError:"PROVIDER_DELIVERY_FAILED"},now);
      } else if(status.state==="delivered")await repo.updateStatus(row.id,"delivered",{deliveredAt:now,...(status.providerMessageId?{providerMessageId:status.providerMessageId}:{})},now);
      else if(Date.now()-Date.parse(row.createdAt)>24*60*60*1000)await repo.updateStatus(row.id,"failed",{lastError:"DELIVERY_UNRESOLVED"},now);
      else await repo.updateStatus(row.id,status.state==="unknown"?"ambiguous":status.state,{nextAttemptAt:new Date(Date.now()+30_000).toISOString(),...(status.providerMessageId?{providerMessageId:status.providerMessageId}:{})},now);
    }catch{increment("support_provider_error_total");}
  }
}

async function refreshOutboxGauges(database: Database) {
  const rows = await database.db
    .select({
      status: assistantOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(assistantOutbox)
    .groupBy(assistantOutbox.status);

  let pending = 0;
  let ambiguous = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "pending" || row.status === "retry" || row.status === "delivering") pending += row.count;
    if (row.status === "ambiguous") ambiguous += row.count;
    if (row.status === "failed") failed += row.count;
  }
  setGauge("assistant_outbox_pending", pending);
  setGauge("assistant_outbox_ambiguous", ambiguous);
  setGauge("assistant_outbox_failed", failed);
}

export async function processPendingOutbox(database: Database, support: SupportConversationProvider) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  await outboxRepo.recoverExpiredClaims();
  await reconcileOutbound(database,support);
  const pending = await outboxRepo.claimPending(20,undefined,support.provider);
  for (const row of pending) {
    await deliverSupportOutbox(database, support, row.id,true);
  }
  await refreshOutboxGauges(database);
}

export const deliverChatwootOutbox = deliverSupportOutbox;
