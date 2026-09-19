# Graphify agent workflow

Use this workflow at the start of non-trivial engineering tasks.

## 1. Load context

```bash
npm run graph:context
```

This incrementally updates the graph, runs health checks, and writes `.graphify/reports/latest-impact.md`.

## 2. Read impact report

Open `.graphify/reports/latest-impact.md` for changed files, affected views, and evidence-based graph queries.

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
| documentation | `npm run graph:query -- "Show documentation/ADR impacted by current diff"` |

## 4. Escalate only for gaps

Spawn targeted subagents when:

- `npm run graph:doctor` reports errors or staleness
- graph queries return insufficient context for the task
- the change touches unaudited areas (new provider, migration, security boundary)

Do **not** automatically run seven parallel full-repo audits on every phase.

## 5. Keep graph fresh

After meaningful code edits in the session:

```bash
npm run graph:update
```
