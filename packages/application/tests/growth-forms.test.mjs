import assert from "node:assert/strict";
import test from "node:test";
import {
  FixedClock,
  GROWTH_CONSENT_VERSION,
  InMemoryAuditRepository,
  InMemoryGrowthRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemoryTransactionManager,
  InMemoryWebhookInboxRepository,
  SequentialIdGenerator,
  joinProductWaitlist,
  submitB2bLead,
  subscribeNewsletter,
} from "../dist/index.js";

function makeDeps() {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  const inbox = new InMemoryWebhookInboxRepository();
  const inventory = new InMemoryInventoryRepository();
  const growth = new InMemoryGrowthRepository();
  const clock = new FixedClock("2026-10-02T00:00:00.000Z");
  const ids = new SequentialIdGenerator();
  const tx = new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory, growth });
  return { growth, audit, outbox, clock, ids, tx };
}

test("newsletter subscription is durable, deduped, and records marketing consent", async () => {
  const deps = makeDeps();
  const first = await subscribeNewsletter({ email: "hello@yubiefood.id", name: "Hello", source: "footer" }, deps);
  assert.equal(first.value.outcome, "subscribed");
  const replay = await subscribeNewsletter({ email: "hello@yubiefood.id", source: "footer" }, deps);
  assert.equal(replay.value.outcome, "already_subscribed");

  assert.equal(deps.growth.newsletter.size, 1);
  const consents = deps.growth.consentLedger.filter((entry) => entry.subjectKey === "hello@yubiefood.id");
  assert.deepEqual(consents.map((entry) => [entry.purpose, entry.action]), [["marketing_newsletter", "granted"]]);
  assert.ok(deps.audit.events.some((event) => event.action === "newsletter.subscribed"));
});

test("waitlist entries are per product and NEVER imply marketing consent", async () => {
  const deps = makeDeps();
  const joined = await joinProductWaitlist({ email: "a@example.com", productId: "shake", source: "pdp" }, deps);
  assert.equal(joined.value.outcome, "joined");
  const again = await joinProductWaitlist({ email: "a@example.com", productId: "shake", source: "pdp" }, deps);
  assert.equal(again.value.outcome, "already_waiting");
  const otherProduct = await joinProductWaitlist({ email: "a@example.com", productId: "mie", source: "pdp" }, deps);
  assert.equal(otherProduct.value.outcome, "joined");

  assert.equal(deps.growth.waitlist.size, 2);
  assert.equal(deps.growth.newsletter.size, 0, "no newsletter row from a waitlist sign-up");
  const purposes = new Set(deps.growth.consentLedger.map((entry) => entry.purpose));
  assert.deepEqual([...purposes], ["product_waitlist"]);
});

test("b2b lead creates a durable row, own consent purpose, and an outbox event", async () => {
  const deps = makeDeps();
  const result = await submitB2bLead({
    name: "Budi",
    business: "Warung Budi",
    type: "restaurant",
    city: "Bandung",
    email: "budi@warung.id",
    whatsapp: "+62812345678",
    intent: "bulk",
    interest: "Yubie Flour 1kg",
    message: "Monthly bulk order",
    source: "b2b-page",
  }, deps);
  assert.equal(result.value.outcome, "created");

  assert.equal(deps.growth.b2bLeads.length, 1);
  const consent = deps.growth.consentLedger.find((entry) => entry.subjectKey === "budi@warung.id");
  assert.equal(consent.purpose, "b2b_contact");
  assert.equal(consent.consentVersion, GROWTH_CONSENT_VERSION);

  const outbox = deps.outbox.events.find((event) => event.eventType === "growth.b2b_lead_created");
  assert.ok(outbox, "B2B lead emits an outbox event for downstream CRM");
  assert.ok(!outbox.payloadJson.includes("Monthly bulk order"), "free-text bodies never travel in outbox payloads");
});
