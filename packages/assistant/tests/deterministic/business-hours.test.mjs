import assert from "node:assert/strict";
import test from "node:test";

test("business hours selects in-hours template on weekday morning WIB", async () => {
  const { isWithinBusinessHours, selectHandoffTemplateId } = await import("../../dist/deterministic/business-hours.js");
  const mondayMorning = new Date("2026-09-21T03:00:00.000Z"); // 10:00 WIB
  assert.equal(isWithinBusinessHours(mondayMorning), true);
  assert.equal(selectHandoffTemplateId(mondayMorning), "handoff.in_hours.v1");
});

test("business hours selects after-hours template outside schedule", async () => {
  const { isWithinBusinessHours, selectHandoffTemplateId } = await import("../../dist/deterministic/business-hours.js");
  const sunday = new Date("2026-09-20T03:00:00.000Z");
  assert.equal(isWithinBusinessHours(sunday), false);
  assert.equal(selectHandoffTemplateId(sunday), "handoff.after_hours.v1");
});

test("handoff templates render approved business-hours copy", async () => {
  const { renderTemplate } = await import("../../dist/deterministic/templates.js");
  assert.match(renderTemplate("handoff.in_hours.v1"), /hubungkan ke Customer Service/);
  assert.match(renderTemplate("handoff.after_hours.v1"), /jam operasional berikutnya/);
});
