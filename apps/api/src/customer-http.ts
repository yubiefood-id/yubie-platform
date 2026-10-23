/** Bounded streaming JSON for customer mutations, before validation or persistence. */
export async function readCustomerJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) return null;
  let length = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > 8192) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    chunks.push(part.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
