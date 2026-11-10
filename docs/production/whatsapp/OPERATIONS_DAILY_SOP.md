# Daily SOP — WhatsApp Business, Yubi Bot, AI budget and priority CS

**Audience:** customer support agents, sales/partnership owners, shift lead, engineer on-call.  
**Status:** operating design; NOT evidence that WhatsApp bot / AI / Coexistence is enabled.  
**Where to reply:** Zammad agent inbox for the officially integrated customer-visible WhatsApp number. The phone app can be used simultaneously only if separately proved supported by Coexistence.

## 1. Role and queue ownership

| Role | Owns | Not authorized to do |
| --- | --- | --- |
| Customer | Select menu, ask bounded AI, ask human, request privacy opt-out | Change internal priority or budgets |
| Yubi deterministic | Approved menus, FAQ, safe routing, receipt acknowledgements | Unverified claims, pricing/contract changes |
| Yubi AI | Optional low-risk responses after per-user opt-in and quota | Direct WhatsApp sends, refunds, order authority, diagnoses |
| CS agent | Priority support queue, complaint resolution, owned ticket and agent replies | Re-enable bot without explicit release |
| Sales owner | Qualified B2B lead, approved price/MOQ, next action and follow-up | Unapproved promotional sends |
| Shift lead | Queue triage, staffing, overdue escalation, urgent incident owner | Override Meta contact permission |
| Engineering on-call | Bot/worker/Zammad health, quotas, recoveries, incident response | View or export private chats unnecessarily |

## 2. Suggested customer-facing menu (pending copy approval)

Halo, selamat datang di Yubie 💜
1. Info Produk & Pemesanan (menu otomatis)
2. Tanya AI Yubi (bantuan pertanyaan umum, penggunaan dibatasi)
3. Customer Service (dibalas tim Yubie sesuai jam operasional)
4. Reseller, Grosir & Partnership
0. Hubungi Tim Yubie

The AI selection must disclose that it is AI, clarify response limits, and provide exit/human commands. Customer service selection creates a Zammad task; it is **not** an instant promise. The explicit-human option remains accessible when AI is OFF or exhausted.

## 3. Queue priorities and human SLA

Suggested **internal** classification (business owner must approve before publishing any external SLA):

| Level | Trigger | Destination | Handling |
| --- | --- | --- | --- |
| P0 | Food safety, illness, allergy reaction, potentially unsafe product | FOOD_SAFETY + support shift lead | Immediate internal alert + named on-call; human responds; preserve evidence |
| P1 | Customer expressly asks for human, payment/refund incident, serious complaint | CUSTOMER_SUPPORT priority | Named agent; acknowledgement and next action |
| P2 | Qualified wholesale/reseller/partnership/samples | SALES_PARTNERSHIP | Sales owner and next action; approval for commercial terms |
| P3 | General FAQ unresolved / unclear | CUSTOMER_SUPPORT routine | Queue and scheduled response |

Provisional staffed-hours triage aims: P0 15 minutes, P1 1 hour, P2 4 business hours, P3 next business day. **Do not display these numbers as a customer promise until roster and leadership approve them.** Nights/weekends have explicit on-call arrangements for P0; otherwise communicate approved staffed hours.

## 4. Daily workflow

### Opening shift (operator, 10–15 minutes)

1. Open Zammad: inspect P0 first, then P1 and oldest unresolved; assign named owners and record next action time.
2. Check Zammad WhatsApp channel, bot webhook, worker queue, support outbox / dead letters and latest live provider receipts. Do not regard /healthz alone as end-to-end health.
3. Review previous-day unresolved handoffs and SLA breaches; reassign absence coverage.
4. Check AI status, per-day and monthly reserved/actual token usage, hard cap, recent quota rejections and budget alert. If unexpected usage, disable AI only; preserve deterministic and manual support.
5. Review sales opportunity queue, new B2B website and WhatsApp leads, follow-up approvals, suppression/opt-out, unprocessed CRM events.
6. Verify approved product/price data and official support hours; never improvise nutrition/halal/BPOM claims.

### During shift

- **Deterministic:** customer chooses normal menu; approved facts and links only.
- **AI:** explicit customer choice -> verified budget reservation -> bounded response -> policy validation -> existing support outbox. When quota exhausted, deterministic fallback + human option; do not manually override the budget.
- **Customer Service:** handoff creates assigned/unassigned priority Zammad ticket. Agent claims and replies through Zammad, with bot locked out while HUMAN_ACTIVE.
- **B2B:** capture business, product, city, volume and consent; create owner + opportunity + task. Sales agent checks quote and customer permission before any outbound draft approval.
- **Food safety:** do not auto-close; preserve facts and immediately notify named human.
- **Repeated identical request:** deduplicate provider webhook/outbound; do not ask the customer to resend solely to workaround system errors.

### Closing shift (operator, 10–15 minutes)

1. Assign open P0/P1 tickets to next on-call/shift; mark due time and escalation reason.
2. Reconcile sent vs delivered vs failed vs ambiguous messages and overdue replays.
3. Compare new B2B leads against CRM opportunities and next action; alert owner if not projected.
4. Record AI daily token/cost, fallback and refusal counts; review sample answers and unsafe-claim incident rate.
5. Mark handoff/complaint resolution explicitly; bot reentry only via audited operator release plus next customer turn.
6. Add concise shift handover: counts, oldest queue age, incidents, action owners and due times. **No unredacted chat transcript or phone number in handover log.**

## 5. Standard ticket fields

Required: ticket ID, source channel, category, priority, human owner or unassigned queue, status, next action, due time, last customer timestamp, consent status if B2B, previous conversation mode, safety flag. The ticket ID is a link, not a second copy of customer content.

## 6. Exception playbook

- **AI quota exhausted:** “Batas bantuan AI untuk saat ini sudah tercapai. Menu otomatis masih tersedia, atau pilih Customer Service.” No additional AI call.
- **AI provider down:** disable AI opt-in, fail to deterministic; maintain human path.
- **Zammad unavailable:** stop customer bot sends; durable queue and manual contingency, no side-channel duplicate WhatsApp sends.
- **Unknown reply/delivery:** reconcile message ID; never blindly retry ambiguous POST.
- **Human takes over:** cancel queued bot replies, record owner and last response.
- **Customer opts out:** honor suppression immediately and record consent revocation; service complaint routing remains separate where required.
- **Adverse reaction / food safety:** P0 human; no AI reassurance, diagnosis or unverified treatment directions.
- **Meta channel or phone-app mismatch:** stop cutover; investigate provider and official docs; do not deregister existing number.

## 7. Weekly review and management KPI

Review first-human-response distribution (staffed hours), P0/P1 backlog, overdue task count, successful qualified leads, lead-to-sample/meeting conversion, AI usage per solved inquiry, model refusal/unsafe output rate, delivery success and cost budget. Review 10 redacted/consented AI conversations for factual accuracy; update approved knowledge with R&D signoff only.

Metrics cannot prove a message was delivered; real Meta/BSP delivery receipts and agent acknowledgement are separate.

## 8. Existing runbooks

docs/production/runbooks/yubie-bot.md ; docs/production/runbooks/assistant-emergency-off.md ; docs/production/runbooks/zammad.md ; docs/production/runbooks/zammad-cutover.md ; infrastructure/zammad/README.md .
