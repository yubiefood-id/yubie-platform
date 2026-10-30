import type { DeliveryLocationAddress, DeliveryLocationProvider, DeliveryLocationSelection, DeliveryLocationSuggestion } from "@yubie/application";
type JsonObject = Record<string, unknown>;
const object = (v: unknown): JsonObject | null => typeof v === "object" && v !== null && !Array.isArray(v) ? v as JsonObject : null;
const placeId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{4,256}$/.test(v);
const token = (v: string) => /^[a-f0-9-]{36}$/i.test(v);
const point = (latitude: unknown, longitude: unknown): boolean => typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
const label = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 500;

/**
 * Best-effort structured Indonesian administrative parts from Google address
 * components. Handles both wire shapes — legacy Geocoding API
 * ({types, long_name}) and Places API (New) ({types, text}) — and keeps the
 * provider's `id`-language naming (e.g. administrative_area_level_2 long name
 * "Kabupaten Bogor"), because shipping coverage is matched against the exact
 * city strings the operator approved.
 */
function parseAddressComponents(components: unknown): DeliveryLocationAddress | undefined {
  if (!Array.isArray(components)) return undefined;
  const address: DeliveryLocationAddress = {};
  const part = (value: string | undefined): string | undefined => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 && trimmed.length <= 100 ? trimmed : undefined;
  };
  for (const entry of components) {
    const component = object(entry);
    if (!component || !Array.isArray(component.types)) continue;
    const value = part(typeof component.long_name === "string" ? component.long_name : typeof component.text === "string" ? component.text : undefined);
    if (!value) continue;
    const types = component.types.filter((t): t is string => typeof t === "string");
    if (!address.province && types.includes("administrative_area_level_1")) address.province = value;
    else if (!address.city && types.includes("administrative_area_level_2")) address.city = value;
    else if (!address.district && types.includes("administrative_area_level_3")) address.district = value;
    else if (!address.postalCode && types.includes("postal_code") && value.length <= 10) address.postalCode = value;
  }
  const structured = Object.keys(address).length > 0 ? address : undefined;
  return structured;
}


/** Fixed Google endpoints only. No response, address, key or coordinate is logged. */
export class GoogleDeliveryLocationProvider implements DeliveryLocationProvider {
  private readonly fetchFn: typeof fetch;
  constructor(private readonly options: { apiKey: string; fetchFn?: typeof fetch }) {
    if (!options.apiKey || options.apiKey.length > 256) throw new Error("MAPS_CONFIG_INVALID");
    this.fetchFn = options.fetchFn ?? fetch;
  }
  private async request(url: string, init: RequestInit): Promise<JsonObject> {
    try {
      const response = await this.fetchFn(url, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let length = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 65_536) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
      const result = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); if (!result) throw new Error(); return result;
    } catch { throw new Error("LOCATION_PROVIDER_UNAVAILABLE"); }
  }
  async autocomplete(input: { query: string; sessionToken: string }): Promise<DeliveryLocationSuggestion[]> {
    if (input.query.trim().length < 3 || input.query.length > 160 || !token(input.sessionToken)) throw new Error("LOCATION_REQUEST_INVALID");
    const data = await this.request("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": this.options.apiKey, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" },
      body: JSON.stringify({ input: input.query, sessionToken: input.sessionToken, languageCode: "id", regionCode: "id", includedRegionCodes: ["id"] }),
    });
    if (!Array.isArray(data.suggestions)) return [];
    return data.suggestions.slice(0, 5).flatMap(value => {
      const p = object(object(value)?.placePrediction), text = object(p?.text)?.text;
      return placeId(p?.placeId) && label(text) ? [{ id: p.placeId, label: text }] : [];
    });
  }
  async details(input: { placeId: string; sessionToken: string }): Promise<DeliveryLocationSelection | null> {
    if (!placeId(input.placeId) || !token(input.sessionToken)) throw new Error("LOCATION_REQUEST_INVALID");
    const data = await this.request(`https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}?sessionToken=${encodeURIComponent(input.sessionToken)}&languageCode=id`, {
      headers: { "X-Goog-Api-Key": this.options.apiKey, "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" },
    });
    const country = Array.isArray(data.addressComponents) && data.addressComponents.some(value => { const c = object(value); return Array.isArray(c?.types) && c.types.includes("country") && c.shortText === "ID"; });
    const location = object(data.location);
    if (!country || !location || !point(location.latitude, location.longitude) || !label(data.formattedAddress) || data.id !== input.placeId) return null;
    const address = parseAddressComponents(data.addressComponents);
    return { label: data.formattedAddress, latitude: location.latitude as number, longitude: location.longitude as number, countryCode: "ID", placeId: input.placeId, ...(address ? { address } : {}) };
  }
  async reverse(input: { latitude: number; longitude: number }): Promise<DeliveryLocationSelection | null> {
    if (!point(input.latitude, input.longitude)) throw new Error("LOCATION_REQUEST_INVALID");
    const query = new URLSearchParams({ latlng: `${input.latitude},${input.longitude}`, key: this.options.apiKey, language: "id", region: "id" });
    const data = await this.request("https://maps.googleapis.com/maps/api/geocode/json?" + query, {});
    if (data.status === "ZERO_RESULTS") return null;
    if (data.status !== "OK" || !Array.isArray(data.results)) throw new Error("LOCATION_PROVIDER_UNAVAILABLE");
    for (const value of data.results.slice(0, 5)) {
      const result = object(value); if (!result || !Array.isArray(result.address_components)) continue;
      const country = result.address_components.some(v => { const c = object(v); return Array.isArray(c?.types) && c.types.includes("country") && c.short_name === "ID"; });
      if (country && label(result.formatted_address)) {
        const address = parseAddressComponents(result.address_components);
        return { latitude: input.latitude, longitude: input.longitude, label: result.formatted_address, countryCode: "ID", ...(placeId(result.place_id) ? { placeId: result.place_id } : {}), ...(address ? { address } : {}) };
      }
    }
    return null;
  }
}
