import { proxyApi } from "@/lib/api-proxy";
export async function GET(request: Request) { return proxyApi(request, "/v1/account/addresses"); }
export async function POST(request: Request) { return proxyApi(request, "/v1/account/addresses"); }
