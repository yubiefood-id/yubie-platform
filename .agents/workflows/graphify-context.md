# Graphify agent workflow

Use this workflow at the start of non-trivial engineering tasks.

## 1. Load context

```bash
npm run graph:context
```

This incrementally updates the AST graph, runs Cursor semantic extraction for changed P0/P1 docs (cache skips unchanged), merges `engineering-graph.json`, runs health checks, and writes `.graphify/reports/latest-impact.md` (v2).

## 2. Read impact report

Open `.graphify/reports/latest-impact.md` for:

- Changed files and affected views
- Semantic extraction status and dirty files
- Potentially stale documentation (code changed but doc SHA unchanged)
- Recommended targeted investigations

## 3. Query by engineering view

Only run broad audits when the graph cannot answer with fresh evidence.

| View | Example query |
|------|----------------|
| contracts | `npm run graph:query -- "Show integration contracts affected by current diff"` |
| infrastructure | `npm run graph:query -- --view infrastructure` |
| boundaries | `npm run graph:query -- "Show architectural boundary violations"` |
| database | `npm run graph:query -- "Show database tables and migrations affected by current diff"` |
| security | `npm run graph:query -- "Show security trust boundaries affected by current diff"` |
| tests | `npm run graph:query -- "Show tests covering files changed in current branch"` |
| documentation | `npm run graph:query -- "What is the support authority and ADR boundaries?"` |

## 4. Escalate only for gaps

Spawn targeted subagents when **any** of these apply:

1. `npm run graph:doctor` reports errors or `STALE` / `BROKEN` freshness
2. Graph queries return insufficient context for the task
3. The change touches unaudited areas (new provider, migration, security boundary)
4. Impact report flags `POTENTIALLY_STALE` docs related to your change
5. `freshness_status` is `DEGRADED_NO_CURSOR` and you need doc authority (ADRs, runbooks)
6. A new ADR/runbook is not yet in the semantic cache

Do **not** automatically run seven parallel full-repo audits on every phase.

## 5. Keep graph fresh

After meaningful **code** edits in the session:

```bash
npm run graph:update
```

After **P0/P1 doc** edits, semantic refresh is scheduled automatically (hooks) or via:

```bash
npm run graph:semantic-bootstrap
```

For active development sessions, optional:

```bash
npm run graph:watch
```
