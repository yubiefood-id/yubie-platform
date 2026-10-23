/** Bounds bytes before buffering customer data at the public edge. */
export async function readProxyBody(request: Request): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const reader = request.body?.getReader(); if (!reader) return undefined;
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > 65_536) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
