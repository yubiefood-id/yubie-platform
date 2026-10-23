/** Browser-only subpath. Never import the server integration barrel in a bundle. */
export interface DeliveryMapPoint { latitude: number; longitude: number; }
export interface DeliveryMapController { setPoint(point: DeliveryMapPoint): void; destroy(): void; }
interface Listener { remove(): void; }
interface LatLng { lat(): number; lng(): number; }
interface MapObject { panTo(point: { lat: number; lng: number }): void; addListener(event: string, callback: (event: { latLng?: LatLng }) => void): Listener; }
interface MarkerObject { map: MapObject | null; position: LatLng | { lat: number; lng: number } | null; addListener(event: string, callback: () => void): Listener; }
interface MapsSdk {
  Map: new (element: HTMLElement, options: object) => MapObject;
  marker: { AdvancedMarkerElement: new (options: object) => MarkerObject };
}
type MapsWindow = Window & { google?: { maps?: MapsSdk }; __yubieMapsReady?: () => void; gm_authFailure?: () => void };
let pending: Promise<MapsSdk> | null = null;
function load(apiKey: string): Promise<MapsSdk> {
  if (typeof window === "undefined") return Promise.reject(new Error("MAP_UNAVAILABLE"));
  const scope = window as MapsWindow;
  if (scope.google?.maps?.Map && scope.google.maps.marker?.AdvancedMarkerElement) return Promise.resolve(scope.google.maps);
  if (pending) return pending;
  pending = new Promise<MapsSdk>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => { clearTimeout(timeout); script.remove(); delete scope.__yubieMapsReady; reject(new Error("MAP_UNAVAILABLE")); };
    const timeout = setTimeout(fail, 8000);
    scope.gm_authFailure = fail;
    scope.__yubieMapsReady = () => {
      clearTimeout(timeout); delete scope.__yubieMapsReady;
      const sdk = scope.google?.maps;
      if (!sdk?.Map || !sdk.marker?.AdvancedMarkerElement) { fail(); return; }
      resolve(sdk);
    };
    script.async = true;
    script.onerror = fail;
    const query = new URLSearchParams({ key: apiKey, v: "quarterly", loading: "async", libraries: "maps,marker", callback: "__yubieMapsReady", auth_referrer_policy: "origin", language: "id", region: "ID" });
    script.src = "https://maps.googleapis.com/maps/api/js?" + query;
    document.head.append(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
export async function createDeliveryMap(options: { apiKey: string; mapId: string; element: HTMLElement | null; point: DeliveryMapPoint; onChange(point: DeliveryMapPoint): void; signal?: AbortSignal }): Promise<DeliveryMapController> {
  if (!options.apiKey || !options.mapId || !options.element || options.signal?.aborted) throw new Error("MAP_UNAVAILABLE");
  const sdk = await load(options.apiKey);
  if (options.signal?.aborted) throw new Error("MAP_UNAVAILABLE");
  const canvas = document.createElement("div"); canvas.style.width = "100%"; canvas.style.height = "100%"; options.element.append(canvas);
  const center = { lat: options.point.latitude, lng: options.point.longitude };
  const map = new sdk.Map(canvas, { center, zoom: 17, mapId: options.mapId, streetViewControl: false, mapTypeControl: false, gestureHandling: "cooperative" });
  const marker = new sdk.marker.AdvancedMarkerElement({ map, position: center, gmpDraggable: true, title: "Titik pengiriman. Geser untuk menyesuaikan lokasi." });
  const change = (latitude: number, longitude: number) => {
    if (Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180) options.onChange({ latitude, longitude });
  };
  // Legacy event remains supported by the pinned quarterly channel.
  const drag = marker.addListener("dragend", () => {
    const p = marker.position; if (!p) return;
    change(typeof p.lat === "function" ? p.lat() : p.lat, typeof p.lng === "function" ? p.lng() : p.lng);
  });
  const click = map.addListener("click", event => {
    if (!event.latLng) return;
    const latitude = event.latLng.lat(), longitude = event.latLng.lng(); marker.position = { lat: latitude, lng: longitude }; change(latitude, longitude);
  });
  return {
    setPoint(point) { const position = { lat: point.latitude, lng: point.longitude }; marker.position = position; map.panTo(position); },
    destroy() { drag.remove(); click.remove(); marker.map = null; canvas.remove(); },
  };
}
