// Isolated acceptance harness. Never included in the production runtime or auth routes.
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { createDatabase, closeDatabase, PostgresOperations, PostgresAdminReaders, PostgresAuditRepository } from '@yubie/persistence';
import { adminHttpHandler } from '../dist/runtime.js';
const url=new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Browser harness requires isolated local PG');
const admin=postgres(url.toString(),{max:1});const name='yubie_ops_browser_'+Date.now();await admin`CREATE DATABASE ${admin(name)}`;url.pathname='/'+name;
const database=createDatabase(url.toString());
for(const file of readdirSync('packages/persistence/migrations').filter(n=>n.endsWith('.sql')).sort())await database.client.unsafe(readFileSync('packages/persistence/migrations/'+file,'utf8'));
for(const [subject,roles] of [['TEST_ONLY_OPERATOR',['operator','qc','fulfillment','finance','admin']],['TEST_ONLY_REVIEWER',['qc','finance']],['TEST_ONLY_VIEWER',['viewer']]])for(const role of roles)await database.client`INSERT INTO ops_staff_grants(subject,role,granted_by,approval_ref,granted_at) VALUES(${subject},${role},'TEST_ONLY_BOOTSTRAP','TEST_ONLY_APPROVAL',now())`;
const options=()=>({sessionSecret:'TEST_ONLY_BROWSER_SECRET_NOT_PRODUCTION',nowMs:Date.now(),operations:new PostgresOperations(database,{writesEnabled:true,checkoutAdmission:'disabled'}),readers:new PostgresAdminReaders(database),audit:new PostgresAuditRepository(database)});
const directory=mkdtempSync(join(tmpdir(),'yubie-ops-browser-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const server=createServer({key:readFileSync(join(directory,'key.pem')),cert:readFileSync(join(directory,'cert.pem'))},adminHttpHandler(options,'https://localhost:4175',resolve('apps/admin/dist/public')));
server.listen(4175,'127.0.0.1',()=>console.log('TEST_ONLY_BROWSER_HARNESS_READY'));
async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));await closeDatabase(database);await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;await admin.end();rmSync(directory,{recursive:true});process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
