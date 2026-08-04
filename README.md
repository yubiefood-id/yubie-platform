# Yubie Platform

Production-oriented full-stack monorepo for **Yubie — Nourish Naturally**, an Indonesian functional-food startup translating local sweet potatoes into modern everyday food formats.

## Workspace map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Multi-route commerce and brand experience built with Next.js/Vinext |
| `apps/api` | Provider-neutral HTTP boundary for catalog, leads, newsletter, and checkout |
| `packages/domain` | Product, cart, order, money, and claim contracts |
| `packages/validation` | Shared Zod request schemas |
| `packages/commerce` | Commerce-provider port plus safe preview adapter |
| `packages/ui` | Shared Yubie design tokens |
| `packages/config` | Shared strict TypeScript baseline |
| `infrastructure` | Deployment boundaries and environment contract |
| `docs` | Architecture, API, launch, and decision records |

## Local development

Prerequisites: Node.js 22.13+ and npm 11+.

```bash
npm ci
npm run dev
```

The website runs through the Vinext development environment. To exercise the standalone API boundary:

```bash
npm run dev:api
```

## Quality gate

```bash
npm run check
```

This runs linting, strict type checks, domain/API tests, the website production build, artifact validation, and rendered-output assertions.

## Commerce safety

The repository intentionally ships with `PreviewCommerceProvider`. It validates cart and checkout intent but never accepts payment. Replace it with an audited production provider only after product pricing, fulfillment, returns, privacy, regulated claims, and webhook verification are approved.

See [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md), and [`docs/launch-readiness.md`](docs/launch-readiness.md).
