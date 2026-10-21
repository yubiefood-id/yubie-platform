import type { Route } from "@playwright/test";

/** Never place service credentials on a browser request's redirect chain. */
export async function continueWithScopedAccess(route: Route, origin: string, clientId?: string, clientSecret?: string) {
  if (new URL(route.request().url()).origin !== origin || !clientId || !clientSecret) return route.continue();
  const response = await route.fetch({
    headers: { ...route.request().headers(), "cf-access-client-id": clientId, "cf-access-client-secret": clientSecret },
    maxRedirects: 0,
  });
  // The browser follows any Location using its original headers; injected
  // credentials exist only in this single APIRequestContext hop.
  await route.fulfill({ response });
}
