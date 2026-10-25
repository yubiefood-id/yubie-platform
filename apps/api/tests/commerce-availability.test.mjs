import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest,setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";
test("disabled admission and unverified availability are explicit without creating payment state",async()=>{
 const names=["YUBIE_ENV","YUBIE_LAUNCH_PROFILE","COMMERCE_PROVIDER","YUBIE_CHECKOUT_ADMISSION","DATABASE_URL","API_PROXY_TOKEN"];
 const before=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 try{
  for(const n of names)delete process.env[n];
  Object.assign(process.env,{YUBIE_ENV:"test",YUBIE_LAUNCH_PROFILE:"DIRECT_COMMERCE_SANDBOX",COMMERCE_PROVIDER:"preview",YUBIE_CHECKOUT_ADMISSION:"disabled"});
  setAppContext(createAppContext());
  const session=await handleRequest(new Request("https://shop.test/v1/checkouts/session"));
  assert.equal((await session.json()).data.admission,"disabled");
  const available=await handleRequest(new Request("https://shop.test/v1/catalog/availability"));assert.equal(available.status,200);
  const data=(await available.json()).data;assert.equal(data.length,9);assert.ok(data.every(row=>row.maxQuantity===0&&row.status==="unverified"));
  const current=await handleRequest(new Request("https://shop.test/v1/checkouts/current"));assert.equal(current.status,200);assert.equal((await current.json()).data,null);
 }finally{for(const [n,v]of Object.entries(before)){if(v===undefined)delete process.env[n];else process.env[n]=v;}}
});
