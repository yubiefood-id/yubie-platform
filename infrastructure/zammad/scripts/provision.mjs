#!/usr/bin/env node

const baseUrl = process.env.ZAMMAD_BASE_URL;
const token = process.env.ZAMMAD_API_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const outputPath = process.env.ZAMMAD_PROVISION_OUTPUT;

if (!baseUrl || !token) {
  console.error("ZAMMAD_BASE_URL and ZAMMAD_API_TOKEN are required");
  process.exit(1);
}

const groupNames = {
  botQueue: "Yubie Bot Queue",
  customerSupport: "Customer Support",
  salesPartnership: "Sales / Partnership",
  foodSafety: "Food Safety",
};

const tags = [
  "bot:deterministic-v1",
  "channel:whatsapp",
  "yubie-ai",
  "b2c",
  "b2b",
  "complaint",
  "food-safety",
  "human-required",
  "handoff:human-request",
  "handoff:food-safety",
  "intent:buy",
  "intent:product-info",
  "intent:order-help",
  "intent:b2b",
  "intent:complaint",
  "product:flour",
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
  const found = existing.find((g) => g.name === name);
  if (found) {
    console.log(JSON.stringify({ event: "zammad.group.exists", name, id: String(found.id) }));
    return String(found.id);
  }
  if (dryRun) {
    console.log(JSON.stringify({ event: "zammad.group.dry_run", name }));
    return null;
  }
  const created = await api("/api/v1/groups", { method: "POST", body: JSON.stringify({ name, active: true }) });
  console.log(JSON.stringify({ event: "zammad.group.created", name, id: String(created.id) }));
  return String(created.id);
}

async function resolvePriorityHigh() {
  const priorities = await api("/api/v1/ticket_priorities");
  const high = priorities.find((p) => /high|urgent|3/i.test(String(p.name)));
  if (high) return String(high.id);
  return priorities[0] ? String(priorities[0].id) : null;
}

async function main() {
  console.log(JSON.stringify({ event: "zammad.provision.start", dryRun, baseUrl }));

  const groupIds = {};
  for (const [key, name] of Object.entries(groupNames)) {
    groupIds[key] = await ensureGroup(name);
  }

  const priorityHigh = dryRun ? null : await resolvePriorityHigh();

  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    dryRun,
    groupIds,
    priorityIds: { high: priorityHigh },
    envMapping: {
      ZAMMAD_GROUP_BOT_QUEUE: groupIds.botQueue,
      ZAMMAD_GROUP_CUSTOMER_SUPPORT: groupIds.customerSupport,
      ZAMMAD_GROUP_SALES_PARTNERSHIP: groupIds.salesPartnership,
      ZAMMAD_GROUP_FOOD_SAFETY: groupIds.foodSafety,
      ZAMMAD_PRIORITY_HIGH: priorityHigh,
    },
    tags,
    notes: [
      "Configure Zammad triggers/webhooks separately; this script only ensures groups and records IDs.",
      "Never commit real API tokens. Store IDs in deployment secrets manager.",
    ],
  };

  console.log(JSON.stringify({ event: "zammad.provision.complete", artifact }, null, 2));

  if (outputPath && !dryRun) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify({ event: "zammad.provision.wrote", outputPath }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
