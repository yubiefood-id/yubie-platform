import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile,readdir,writeFile} from "node:fs/promises";
import {join,relative} from "node:path";

const root=process.argv[2];
if(!root)throw new Error("Web project root required");
const sha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
const dirty=execFileSync("git",["status","--porcelain","--untracked-files=no"],{cwd:root,encoding:"utf8"}).trim().length>0;
const files=[];
async function walk(dir) {
 for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=join(dir,entry.name);
  if(entry.isDirectory())await walk(path);
  else if(entry.name!=="release-manifest.json")files.push({path:relative(join(root,"dist"),path),sha256:createHash("sha256").update(await readFile(path)).digest("hex")});
 }
}
await walk(join(root,"dist","client"));
await walk(join(root,"dist","server"));
const artifactDigest="sha256:"+createHash("sha256").update(JSON.stringify(files)).digest("hex");
await writeFile(join(root,"dist/client/release-manifest.json"),JSON.stringify({releaseSha:sha,dirty,artifactDigest,launchProfile:process.env.NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE??"unknown",builtAtUtc:new Date().toISOString()},null,2)+"\n");
console.log(JSON.stringify({event:"web.release_identity",releaseSha:sha,dirty,artifactDigest}));
