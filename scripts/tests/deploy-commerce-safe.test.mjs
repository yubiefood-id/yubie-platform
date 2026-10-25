import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const script=new URL("../deploy-commerce-safe.sh",import.meta.url).pathname;
test("release execution rejects an unpinned source before touching production",()=>{
 const result=spawnSync("bash",[script,"main","image","image"],{encoding:"utf8"});
 assert.equal(result.status,64);
});
test("release execution rejects moving tags and images from another registry",()=>{
 for(const image of ["ghcr.io/yubiefood-id/yubie-api:latest","other.invalid/yubie-api@sha256:"+"b".repeat(64)]){
  const result=spawnSync("bash",[script,"a".repeat(40),image,"ghcr.io/yubiefood-id/yubie-worker@sha256:"+"c".repeat(64)],{encoding:"utf8"});
  assert.equal(result.status,64);
 }
});
