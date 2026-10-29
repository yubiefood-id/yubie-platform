import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

test("promotion fixture touches only its approved origin and leaves opaque frames alone", () => {
  const program = `
    import { createServer } from 'node:http';
    import { chromium } from '@playwright/test';
    import { dismissPromotionForOrigin } from './e2e/support/public-storage.ts';
    const servers = [createServer((_,res)=>res.end('<h1>Fixture</h1><iframe sandbox srcdoc="opaque frame"></iframe>')),createServer((_,res)=>res.end('<h1>Other origin</h1>'))];
    for (const server of servers) await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin = index=>'http://127.0.0.1:'+servers[index].address().port;
    const browser=await chromium.launch();
    try {
      const context=await browser.newContext();
      await context.addInitScript(dismissPromotionForOrigin,origin(0));
      const page=await context.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(error.name));
      await page.goto('data:text/html,opaque document');
      await page.goto(origin(0));
      const approved=await page.evaluate(()=>sessionStorage.getItem('yubie.promo.dismissed.v1'));
      await page.goto(origin(1));
      const foreign=await page.evaluate(()=>sessionStorage.getItem('yubie.promo.dismissed.v1'));
      console.log(JSON.stringify({errors,approved,foreign}));
    } finally { await browser.close(); for(const server of servers) await new Promise(resolve=>server.close(resolve)); }
  `;
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.approved, "1");
  assert.equal(result.foreign, null);
});
