"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeliveryMapController, DeliveryMapPoint } from "@yubie/integrations/google-maps/browser";

export function DeliveryMap({ point, onChange }: { point: DeliveryMapPoint; onChange(point: DeliveryMapPoint): void }) {
  const element = useRef<HTMLDivElement>(null), controller = useRef<DeliveryMapController | null>(null);
  const initial = useRef(point), changed = useRef(onChange);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState<DeliveryMapController | null>(null);
  useEffect(() => { changed.current = onChange; }, [onChange]);
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    import("@yubie/integrations/google-maps/browser").then(adapter => adapter.createDeliveryMap({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "", mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "",
      element: element.current, point: initial.current, onChange: value => changed.current(value), signal: abort.signal,
    })).then(map => { if (cancelled) map.destroy(); else { controller.current = map; setReady(map); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; abort.abort(); controller.current?.destroy(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { ready?.setPoint(point); }, [point, ready]);
  return <div className="delivery-map-wrap">
    <div ref={element} className="delivery-map" role="region" aria-label="Peta titik pengiriman" hidden={failed} />
    {failed ? <p role="status">Peta belum dapat dimuat. Kamu tetap bisa memasukkan alamat manual.</p> : <p className="checkout-note">Geser pin atau pilih titik di peta. Alamat manual selalu tersedia.</p>}
  </div>;
}
