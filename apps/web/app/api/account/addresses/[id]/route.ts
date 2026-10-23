import { proxyApi } from "@/lib/api-proxy";
async function forward(request: Request, params: Promise<{ id: string }>) { const { id } = await params; return proxyApi(request, `/v1/account/addresses/${encodeURIComponent(id)}`); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return forward(request, params); }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return forward(request, params); }
