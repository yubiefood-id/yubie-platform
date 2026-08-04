# Engineering operating guide

## Product truth

- Yubie is an Indonesian functional-food brand, not a supplement or medical product.
- Do not publish unverified nutrition, certification, allergen, weight-loss, disease, or meal-replacement claims.
- `Yubie Flour` is available in the current catalog. `Yubie Shake` and `Yubie Ppang` remain `coming-soon` until commercial data is verified.
- Prices and availability must originate from a commerce/catalog boundary before real checkout is enabled.

## Architecture rules

- `apps/web` owns presentation, navigation, progressive enhancement, and web route adapters.
- `apps/api` owns the public backend boundary and must not import UI code.
- Business contracts live in `packages/domain`; request validation lives in `packages/validation`.
- Payment providers implement `CommerceProvider`; provider-specific objects must not leak into domain or UI code.
- Shared brand values live in `packages/ui` and must remain accessible at WCAG AA contrast where applied to text.
- Never commit credentials or real customer data. Keep environment values in deployment secrets.

## Change gate

Before requesting review, run `npm run check`. Any commerce, claims, checkout, privacy, or data-retention change requires explicit reviewer attention in the PR description.
