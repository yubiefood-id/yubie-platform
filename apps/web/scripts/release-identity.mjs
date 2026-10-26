import {execFileSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {artifactDigest as digestTree} from "./artifact-digest.mjs";

const root=process.argv[2];
if(!root)throw new Error("Web project root required");
const sha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
const dirty=execFileSync("git",["status","--porcelain","--untracked-files=no"],{cwd:root,encoding:"utf8"}).trim().length>0;
const artifactDigest=await digestTree(root);
await writeFile(join(root,"dist/client/release-manifest.json"),JSON.stringify({releaseSha:sha,dirty,artifactDigest,launchProfile:process.env.NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE??"unknown",builtAtUtc:new Date().toISOString()},null,2)+"\n");
console.log(JSON.stringify({event:"web.release_identity",releaseSha:sha,dirty,artifactDigest}));
