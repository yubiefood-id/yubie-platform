// Reviewed operator CLI only. Never exposed as an anonymous HTTP route.
import { readFileSync, lstatSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase, closeDatabase } from '@yubie/persistence';
import { staffGrantSchema } from '@yubie/validation';
const file=process.argv[2];
if(!file||process.argv.length!==3)throw new Error('Usage: node scripts/operations/bootstrap-staff.mjs /protected/approved-staff.json');
if(process.getuid()!==0||resolve(file)!==file)throw new Error('Root operator and absolute protected approval path required');
for(let path=file;;path=dirname(path)){
 const info=lstatSync(path);
 if(info.isSymbolicLink()||info.uid!==0||(info.mode&0o022))throw new Error('Approval and every parent must be root controlled');
 if(path==='/')break;
}
const descriptor=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
let raw;
try{
 const metadata=fstatSync(descriptor);
 if(!metadata.isFile()||metadata.nlink!==1||(metadata.mode&0o077)||metadata.uid!==0)throw new Error('Root-owned mode 0600 approval file required');
 raw=readFileSync(descriptor,'utf8');
}finally{closeSync(descriptor);}
const approval=JSON.parse(raw);
if(approval.action!=='bootstrap_named_operations_staff'||!/^[a-f0-9]{40}$/.test(approval.sourceSha??'')||approval.sourceSha!==process.env.RELEASE_SHA||!approval.approvedBy||!approval.approvalRef||/PENDING|PROPOSED|BELUM|TEST_ONLY/.test(JSON.stringify(approval)))throw new Error('Genuine source-bound owner approval required');
const start=Date.parse(approval.notBefore),end=Date.parse(approval.expiresAt);
if(!Number.isFinite(start)||!Number.isFinite(end)||end-start>3600000||end<=start||Date.now()<start||Date.now()>=end)throw new Error('Approval window must be active and at most one hour');
if(!Array.isArray(approval.staff)||!approval.staff.length||approval.staff.length>30)throw new Error('Explicit named staff list required');
const grants=approval.staff.map(item=>staffGrantSchema.parse({...item,action:'grant',approvalRef:approval.approvalRef,reason:'Owner-approved initial staff bootstrap'}));
if(!grants.some(item=>item.role==='admin')||new Set(grants.map(item=>item.subject+':'+item.role)).size!==grants.length)throw new Error('Named admin and unique subject/role grants required');
const database=createDatabase(process.env.DATABASE_URL);
try{
 await database.client.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtextextended('ops-staff-grants',0))`;
  const current=await tx`SELECT subject,role,approval_ref FROM ops_staff_grants`;
  if(current.length){
   if(current.length===grants.length&&current.every(row=>row.approval_ref===approval.approvalRef&&grants.some(grant=>grant.subject===row.subject&&grant.role===row.role)))return;
   throw new Error('Staff already initialized; use authenticated audited staff management');
  }
  for(const grant of grants)await tx`INSERT INTO ops_staff_grants(subject,role,granted_by,approval_ref,granted_at) VALUES(${grant.subject},${grant.role},${approval.approvedBy},${approval.approvalRef},now())`;
  const event='opevent_'+randomUUID();
  const audit={count:grants.length,approvalRef:approval.approvalRef,sourceSha:approval.sourceSha,approvalSha256:createHash('sha256').update(raw).digest('hex')};
  await tx`INSERT INTO ops_events(id,actor,action,resource_id,metadata_json,occurred_at) VALUES(${event},${approval.approvedBy},'ops.staff_bootstrap','staff',${JSON.stringify(audit)}::jsonb,now())`;
  await tx`INSERT INTO audit_events(id,actor,action,resource_type,resource_id,occurred_at) VALUES(${'audit_'+randomUUID()},${approval.approvedBy},'ops.staff_bootstrap','operations','staff',now())`;
  await tx`INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_id,payload_json,dedupe_key,status,available_at,attempt_count) VALUES(${'outbox_'+randomUUID()},'ops.changed','operations','staff',${JSON.stringify({eventId:event,action:'ops.staff_bootstrap'})},${'ops:'+event},'pending',now(),0)`;
 });
 console.log(JSON.stringify({result:'NAMED_STAFF_BOOTSTRAP_VERIFIED',count:grants.length,mutationScope:'operations_staff_only'}));
}finally{await closeDatabase(database);}
