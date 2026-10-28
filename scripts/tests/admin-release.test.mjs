import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
test('admin release seal requires clean exact source and immutable image',()=>{
 const root=mkdtempSync(join(tmpdir(),'yubie-admin-seal-'));
 try{
  mkdirSync(join(root,'infrastructure'),{recursive:true});mkdirSync(join(root,'scripts/operations'),{recursive:true});mkdirSync(join(root,'out'));
  for(const name of ['infrastructure/docker-compose.admin-private.yml','scripts/operations/bootstrap-staff.mjs','scripts/operations/admin-database-grants.sql'])writeFileSync(join(root,name),'TEST_ONLY_MATERIAL');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  git('init','-q');git('config','user.name','TEST_ONLY');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','TEST_ONLY reviewed fixture');
  const sha=git('rev-parse','HEAD'),script=resolve('scripts/operations/seal-release.mjs');
  const run=image=>spawnSync(process.execPath,[script,sha,image,'out'],{cwd:root,encoding:'utf8'});
  assert.equal(run('ghcr.io/yubiefood-id/yubie-admin:latest').status,77);
  assert.equal(run('ghcr.io/yubiefood-id/yubie-admin@sha256:'+'a'.repeat(64)).status,0);
  const manifest=JSON.parse(readFileSync(join(root,'out/admin-release-manifest.json'),'utf8'));assert.equal(manifest.sourceSha,sha);assert.equal(manifest.productionDeployed,false);
  writeFileSync(join(root,'infrastructure/docker-compose.admin-private.yml'),'TAMPERED');
  assert.equal(run('ghcr.io/yubiefood-id/yubie-admin@sha256:'+'a'.repeat(64)).status,77);
 }finally{rmSync(root,{recursive:true,force:true});}
});
