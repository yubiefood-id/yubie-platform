# Yubie Development Engineering Handbook

**Canonical business model:** marketplace-first D2C + WhatsApp-first B2C/B2B.

This handbook is both architecture documentation and an execution contract. It distinguishes the **current repository** from **target components** so agents do not falsely assume planned packages already exist.

## Reading order

### Foundation

1. [Development Goals](../DEVELOPMENT_GOALS.md)
2. [Current State](./00_CURRENT_STATE_AND_GAP_ANALYSIS.md)
3. [Canonical Architecture](../ARCHITECTURE.md)
4. [ADR-004 Marketplace/WhatsApp First](../production/ADR-004_MARKETPLACE_WHATSAPP_FIRST.md)
5. [Technology Stack](./06_TECH_STACK_AND_REPOSITORY.md)

### Current channel architecture

6. [Marketplace/WhatsApp Architecture](./19_MARKETPLACE_WHATSAPP_ARCHITECTURE.md)
7. [WhatsApp CRM Chatbot](./20_WHATSAPP_CRM_CHATBOT.md)
8. [Marketplace Integration](./21_MARKETPLACE_INTEGRATION_AND_ATTRIBUTION.md)
9. [Channel Data Model](./22_MARKETPLACE_WHATSAPP_DATA_MODEL.md)
10. [Local Development](./23_MARKETPLACE_WHATSAPP_LOCAL_DEVELOPMENT.md)
11. [High-level Phase Plan](./24_MARKETPLACE_WHATSAPP_PHASE_PLAN.md)

### Detailed implementation contract

12. [Engineering Execution Model](./25_ENGINEERING_EXECUTION_MODEL.md)
13. [Backend/Application Architecture](./26_BACKEND_APPLICATION_AND_INTEGRATION_ARCHITECTURE.md)
14. [Database and Migration Plan](./27_DATABASE_SCHEMA_AND_MIGRATION_PLAN.md)
15. [Assistant/CRM Automation](./28_ASSISTANT_KNOWLEDGE_AND_CRM_AUTOMATION.md)
16. [Marketplace Routing/Imports](./29_MARKETPLACE_ROUTING_IMPORT_AND_ANALYTICS.md)
17. [Product Truth and Food-tech Governance](./30_PRODUCT_TRUTH_CONTENT_AND_FOOD_TECH_GOVERNANCE.md)
18. [Testing/Security/Release Gates](./31_TESTING_SECURITY_AND_RELEASE_GATES.md)
19. [Environment Strategy](./32_LOCAL_STAGING_AND_PRODUCTION_ENVIRONMENTS.md)
20. [VPS Application Topology](./33_VPS_DEPLOYMENT_ARCHITECTURE.md)
21. [Observability/Backup/DR](./34_OBSERVABILITY_SLOS_BACKUP_AND_DR.md)
22. [Operations/On-call](./35_OPERATIONS_RUNBOOKS_AND_ONCALL.md)
23. [Capacity/Cost/Scaling](./36_CAPACITY_COST_AND_SCALING_PLAN.md)
24. [Detailed M0-M8 phases](./phases/README.md)
25. [Production VPS Handbook](../production/vps/README.md)

## Engineering execution rule

Every capability is delivered as a vertical slice:

~~~text
problem
 -> domain model
 -> persistence
 -> application use case
 -> API/webhook/worker
 -> provider adapter
 -> operator visibility
 -> failure/reconciliation path
 -> tests/evidence
~~~

Do not build generic infrastructure without a phase requirement.

## Precedence

If documents conflict:

1. `AGENTS.md` product/safety rules;
2. current accepted ADRs;
3. `docs/ARCHITECTURE.md`;
4. this detailed handbook and phase docs;
5. older direct-commerce material retained as future reference.

ADR-004 supersedes any older assumption that yubie.id must process D2C payment today.
