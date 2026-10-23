import { createHash, timingSafeEqual } from "node:crypto";
import { parseYubieEnvName } from "@yubie/config";
import {deriveYubiCapabilities,parseLaunchProfile} from "@yubie/config";
import {approvedYubiPhotos} from "@yubie/domain";
import {yubiReentrySchema,yubiFlowVersionSchema} from "@yubie/validation";
import {
  withAssistantTransaction,
  PostgresAssistantOutboxRepository,
  PostgresRuntimeConfigRepository,
  PostgresConversationSessionRepository,
  type Database,
} from "@yubie/persistence";

export function authorizeOps(request: Request): boolean {
  const token = process.env.OPS_API_TOKEN ?? "";
  if (token) {
    const auth = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${token}`;
    const presentedDigest = createHash("sha256").update(auth).digest();
    const expectedDigest = createHash("sha256").update(expected).digest();
    return timingSafeEqual(presentedDigest, expectedDigest);
  }
  // Without a token the ops surface is reachable only in explicitly local
  // environments — never staging/preview/production deployments.
  const env = parseYubieEnvName(process.env.YUBIE_ENV);
  return (env === "development" || env === "test") && process.env.NODE_ENV !== "production";
}

export async function handleOpsAssistant(request: Request, database: Database): Promise<Response | null> {
  if(!new URL(request.url).pathname.startsWith("/ops/assistant"))return null;
  if(!authorizeOps(request))return Response.json({error:"unauthorized"},{status:401});
  return withAssistantTransaction(database,bound=>handleOpsAssistantLocked(request,bound),"yubi:runtime-config");
}

async function handleOpsAssistantLocked(request: Request, database: Database): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/ops/assistant")) return null;

  if (!authorizeOps(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const runtime = new PostgresRuntimeConfigRepository(database);
  const outbox = new PostgresAssistantOutboxRepository(database);

  if(request.method==="POST" && url.pathname==="/ops/assistant/reentry") {
    const parsed=yubiReentrySchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"invalid_reentry"},{status:400});
    const body=parsed.data;
    const now=new Date().toISOString();
    const released=await withAssistantTransaction(database,async bound=>{
      const ok=await new PostgresConversationSessionRepository(bound).releaseForReentry(body.provider!,body.threadId!,now);
      if(ok)await new PostgresRuntimeConfigRepository(bound).set("last_bot_reentry",{provider:body.provider,threadId:body.threadId},body.changedBy!,now);
      return ok;
    });
    return Response.json({ok:released,requiresCustomerMenu:true},{status:released?200:409});
  }

  if(request.method==="POST" && url.pathname==="/ops/assistant/flow-version") {
    const parsed=yubiFlowVersionSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"invalid_flow_selection"},{status:400});
    const body=parsed.data;
    if(body.releaseSha!==process.env.RELEASE_SHA)return Response.json({error:"release_identity_mismatch"},{status:409});
    const config=await runtime.getSnapshot();
    const mode=config.mode==="auto"?"shadow":config.mode;
    await runtime.setMany([{key:"deterministic_flow_version",value:body.flowVersion},{key:"flow_selection_approval",value:{releaseSha:body.releaseSha,approvalRef:body.approvalRef}},{key:"mode",value:mode}],body.changedBy,new Date().toISOString());
    return Response.json({ok:true,flowVersion:body.flowVersion,mode,requiresSeparateActivation:true});
  }

  if (request.method === "GET" && url.pathname === "/ops/assistant") {
    const config = await runtime.getSnapshot();
    const counts=await outbox.counts();
    const queueLag=counts.filter(r=>['pending','retry','delivering'].includes(r.status)).reduce((n,r)=>n+r.count,0);
    const deadLetters=counts.filter(r=>['failed','ambiguous'].includes(r.status)).reduce((n,r)=>n+r.count,0);

    return Response.json({
      mode: config.mode,
      flowVersion: config.flowVersion,
      assistantEnabled: config.assistantEnabled,
      modelVersion: config.modelVersion,
      promptVersion: config.promptVersion,
      knowledgeVersion: config.knowledgeVersion,
      allowedGreenIntents: config.allowedGreenIntents,
      queueLag,
      deadLetters,
      releaseSha: process.env.RELEASE_SHA ?? "dev",
    });
  }

  if (request.method === "POST" && url.pathname === "/ops/assistant/mode") {
    const body = (await request.json()) as { mode?: string; changedBy?: string };
    const allowed = ["off", "shadow", "suggestion", "auto"];
    if (!body.mode || !allowed.includes(body.mode)) {
      return Response.json({ error: "invalid_mode" }, { status: 400 });
    }
    if(body.mode==="auto" && process.env.YUBIE_ENV==="production") {
      const config=await runtime.getSnapshot();
      if(config.flowVersion==="deterministic-v2") {
        const acceptance=config.supportAcceptance as {releaseSha?:string;approvalRef?:string;operationsAccepted?:boolean}|null;
        const caps=deriveYubiCapabilities(parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE),config.websiteRelease,"production");
        if(!acceptance?.approvalRef || acceptance.releaseSha!==process.env.RELEASE_SHA || acceptance.operationsAccepted!==true || !caps.catalog_available || new Set(approvedYubiPhotos.map(a=>a.productId)).size!==4)return Response.json({error:"yubi_v2_acceptance_required"},{status:409});
      }
    }
    const now=new Date().toISOString();
    await runtime.setMany([{key:"mode",value:body.mode},{key:"assistant_enabled",value:body.mode!=="off"}],body.changedBy??"operator",now);
    if(body.mode==="off")await outbox.cancelPendingCustomer(now);
    return Response.json({ ok: true, mode: body.mode });
  }

  if (request.method === "POST" && url.pathname === "/ops/assistant/emergency-off") {
    const body = (await request.json()) as { changedBy?: string };
    const changedBy = body.changedBy ?? "operator";
    const now = new Date().toISOString();
    await runtime.setMany([{key:"assistant_enabled",value:false},{key:"mode",value:"off"}],changedBy,now);
    await outbox.cancelPendingCustomer(now);
    return Response.json({ ok: true, assistantEnabled: false });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
