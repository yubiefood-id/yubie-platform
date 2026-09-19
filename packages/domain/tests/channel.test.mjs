import assert from "node:assert/strict";
import test from "node:test";
import { isMarketplace, isActiveListing } from "../dist/index.js";

test("isMarketplace validates channel enum", () => {
  assert.equal(isMarketplace("shopee"), true);
  assert.equal(isMarketplace("tokopedia"), true);
  assert.equal(isMarketplace("evil"), false);
});

test("isActiveListing only accepts active status", () => {
  assert.equal(isActiveListing({ status: "active" }), true);
  assert.equal(isActiveListing({ status: "paused" }), false);
});
