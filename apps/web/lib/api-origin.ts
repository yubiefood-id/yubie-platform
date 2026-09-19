export function getApiOrigin(): string {
  return process.env.YUBIE_API_ORIGIN ?? process.env.NEXT_PUBLIC_YUBIE_API_ORIGIN ?? "http://localhost:8787";
}
