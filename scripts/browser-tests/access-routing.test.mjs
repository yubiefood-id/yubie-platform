import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { continueWithScopedAccess } from "../../e2e/support/access-routing.ts";

test("Access service credentials reach only the approved origin across redirects", async () => {
  let approvedHeader, leakedHeader;
  const target = createServer((req, res) => { leakedHeader = req.headers["cf-access-client-secret"]; res.end("redirect complete"); });
  const source = createServer((req, res) => { approvedHeader = req.headers["cf-access-client-secret"]; res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/target` }); res.end(); });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => source.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${source.address().port}`;
    await page.route("**/*", (route) => continueWithScopedAccess(route, origin, "synthetic-id", "synthetic-secret"));
    await page.goto(origin);
    assert.equal(approvedHeader, "synthetic-secret");
    assert.equal(leakedHeader, undefined);
  } finally {
    await browser?.close();
    await Promise.all([new Promise((resolve) => source.close(resolve)), new Promise((resolve) => target.close(resolve))]);
  }
});
