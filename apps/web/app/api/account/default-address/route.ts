import { proxyApi } from "@/lib/api-proxy";
export async function PUT(request: Request) { return proxyApi(request, "/v1/account/default-address"); }
