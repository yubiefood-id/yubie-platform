import { proxyApi } from "@/lib/api-proxy";

// Durable submission (B9): the same-origin proxy forwards to apps/api, which
// persists the row + consent ledger entry transactionally. The old local
// "validated-prototype" 202 dropped every submission.
export async function POST(request: Request) {
  return proxyApi(request, "/v1/waitlist");
}
