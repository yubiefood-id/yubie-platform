#!/usr/bin/env node

const baseUrl = process.env.ZAMMAD_BASE_URL;
const token = process.env.ZAMMAD_API_TOKEN;
const dryRun = process.argv.includes("--dry-run");

if (!baseUrl || !token) {
  console.error("ZAMMAD_BASE_URL and ZAMMAD_API_TOKEN are required");
  process.exit(1);
}

const groups = [
  "Yubie Bot Queue",
  "Customer Support",
  "Sales / Partnership",
  "Food Safety",
];

const tags = [
  "yubie-ai",
  "b2c",
  "b2b",
  "bulk",
  "sample",
  "product-development",
  "complaint",
  "food-safety",
  "human-required",
  "priority",
];

const customAttributes = [
  { name: "yubie_bot_mode", display: "Yubie Bot Mode", data_type: "select", data_option: { options: { OFF: "OFF", SHADOW: "SHADOW", SUGGEST: "SUGGEST", AUTO: "AUTO" } } },
  { name: "yubie_ai_state", display: "Yubie AI State", data_type: "select", data_option: { options: { IDLE: "IDLE", PROCESSING: "PROCESSING", SENT: "SENT", HANDOFF: "HANDOFF", FAILED: "FAILED" } } },
  { name: "yubie_handoff_reason", display: "Yubie Handoff Reason", data_type: "input" },
  { name: "yubie_customer_type", display: "Yubie Customer Type", data_type: "select", data_option: { options: { UNKNOWN: "UNKNOWN", B2C: "B2C", B2B: "B2B" } } },
  { name: "yubie_product_interest", display: "Yubie Product Interest", data_type: "input" },
];

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token token=${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} failed: ${response.status} ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function ensureGroup(name) {
  const existing = await api("/api/v1/groups");
  if (existing.some((g) => g.name === name)) {
    console.log(`group exists: ${name}`);
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] would create group: ${name}`);
    return;
  }
  await api("/api/v1/groups", { method: "POST", body: JSON.stringify({ name, active: true }) });
  console.log(`created group: ${name}`);
}

async function main() {
  console.log(JSON.stringify({ event: "zammad.provision.start", dryRun, baseUrl }));

  for (const group of groups) {
    await ensureGroup(group);
  }

  for (const tag of tags) {
    console.log(dryRun ? `[dry-run] ensure tag: ${tag}` : `tag catalog note: create/use tag ${tag} via tickets`);
  }

  for (const attr of customAttributes) {
    console.log(
      dryRun
        ? `[dry-run] custom attribute: ${attr.name}`
        : `custom attribute ${attr.name}: configure via Object Manager if API create unsupported on this Zammad version`,
    );
  }

  console.log(JSON.stringify({ event: "zammad.provision.complete", dryRun }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
