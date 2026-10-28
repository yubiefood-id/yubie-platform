import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, lstatSync, existsSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const [sha,image,output]=process.argv.slice(2);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
try {
 if(process.argv.length!==5||!/^[a-f0-9]{40}$/.test(sha??'')||git('rev-parse','HEAD')!==sha||git('status','--porcelain','--untracked-files=no'))throw new Error('EXACT_CLEAN_SOURCE_REQUIRED');
 if(!/^ghcr\.io\/yubiefood-id\/yubie-admin@sha256:[a-f0-9]{64}$/.test(image??''))throw new Error('IMMUTABLE_ADMIN_IMAGE_REQUIRED');
 const files=['infrastructure/docker-compose.admin-private.yml','scripts/operations/bootstrap-staff.mjs','scripts/operations/admin-database-grants.sql'];
 const tracked=new Set(git('ls-files').split('\n'));
 const hashes={};for(const file of files){if(!tracked.has(file)||lstatSync(file).isSymbolicLink())throw new Error('UNTRUSTED_MATERIAL');hashes[file]=createHash('sha256').update(readFileSync(file)).digest('hex');}
 const archive=resolve(output,'admin-materials.tgz'),manifestPath=resolve(output,'admin-release-manifest.json');
 if(existsSync(archive)||existsSync(manifestPath))throw new Error('SEALED_MATERIAL_ALREADY_EXISTS');
 execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',archive,...files]);
 const archiveSha256=createHash('sha256').update(readFileSync(archive)).digest('hex');
 const manifest={schemaVersion:1,sourceSha:sha,adminImage:image,archiveSha256,files:hashes,workerName:'yubie-web-production',adminOrigin:'https://localhost:4174',composeProject:'yubie-ops-production',checkoutAdmission:'disabled',operationsWritesDefault:false,productionDeployed:false};
 writeFileSync(resolve(output,'admin-release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const manifestSha256=createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
 appendFileSync(resolve(output,'SHA256SUMS'),archiveSha256+'  admin-materials.tgz\n'+manifestSha256+'  admin-release-manifest.json\n');
 console.log(JSON.stringify({sourceSha:sha,adminImage:image,productionDeployed:false}));
} catch(error){console.error(error instanceof Error?error.message:'SEAL_FAILED');process.exitCode=77;}
