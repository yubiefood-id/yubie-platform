"use client";
import { useEffect, useRef, useState } from "react";
import type { DeliveryPinInput } from "@yubie/domain";
import { customerRequest } from "@/lib/customer-api";
import { DeliveryMap } from "./delivery-map";
interface Suggestion { id: string; label: string; }
interface Selection { label: string; latitude: number; longitude: number; }
type Candidate = Omit<DeliveryPinInput, "confirmed">;

export function LocationPicker({ available, pin, onConfirm, manualId }: { available: boolean; pin?: DeliveryPinInput | null | undefined; onConfirm(pin: DeliveryPinInput | null): void; manualId: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null), [message, setMessage] = useState("");
  const [search, setSearch] = useState(""), [searching, setSearching] = useState(false), [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]), [preview, setPreview] = useState("");
  const sessionToken = useRef<string | null>(null), active = useRef(true), generation = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!available || !searching || search.trim().length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      sessionToken.current ??= crypto.randomUUID();
      customerRequest<Suggestion[]>("/api/locations/autocomplete", "POST", { query: search, sessionToken: sessionToken.current })
        .then(rows => { if (!cancelled) setSuggestions(rows); })
        .catch(() => { if (!cancelled) { setSuggestions([]); setMessage("Pencarian belum tersedia. Masukkan alamat secara manual."); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [available, search, searching]);

  const locate = () => {
    if (!navigator.geolocation) { setMessage("Perangkat ini belum mendukung lokasi. Masukkan alamat manual."); return; }
    const current = ++generation.current;
    setBusy(true); setMessage("");
    navigator.geolocation.getCurrentPosition(async position => {
      if (!active.current || current !== generation.current) return;
      const next: Candidate = { latitude: position.coords.latitude, longitude: position.coords.longitude, source: "device", accuracyMeters: position.coords.accuracy };
      setCandidate(next); setPreview(""); onConfirm(null);
      setMessage(position.coords.accuracy > 250 ? "Lokasi belum cukup akurat. Sesuaikan pin di peta atau masukkan alamat manual." : "Periksa titik pengiriman sebelum mengonfirmasi.");
      if (available) {
        try { const result = await customerRequest<Selection | null>("/api/locations/reverse-geocode", "POST", { latitude: next.latitude, longitude: next.longitude }); if (active.current && current === generation.current) setPreview(result?.label ?? ""); } catch { /* Manual fields remain available. */ }
      }
      if (active.current && current === generation.current) setBusy(false);
    }, () => { if (active.current && current === generation.current) { setBusy(false); setMessage("Lokasi tidak dapat diakses. Cari alamat atau masukkan secara manual."); } }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  };
  const choose = async (suggestion: Suggestion) => {
    const current = ++generation.current; setBusy(true); setSearching(false); setSuggestions([]);
    try {
      const result = await customerRequest<Selection | null>("/api/locations/details", "POST", { placeId: suggestion.id, sessionToken: sessionToken.current });
      if (!active.current || current !== generation.current) return;
      if (!result) { setMessage("Lokasi belum ditemukan di area pengiriman. Masukkan alamat Indonesia secara manual."); return; }
      setCandidate({ latitude: result.latitude, longitude: result.longitude, source: "google" }); setPreview(result.label); onConfirm(null); setMessage("Periksa pin dan lengkapi alamat pengiriman di bawah.");
    } catch { if (active.current && current === generation.current) setMessage("Lokasi belum dapat dipilih. Masukkan alamat secara manual."); }
    finally { sessionToken.current = null; if (active.current && current === generation.current) setBusy(false); }
  };
  const manual = () => {
    generation.current++; setBusy(false); setSearching(false); setSuggestions([]); setCandidate(null); setPreview(""); onConfirm(null);
    document.getElementById(manualId)?.focus();
  };
  const moved = (point: { latitude: number; longitude: number }) => {
    generation.current++; setBusy(false); setCandidate({ ...point, source: "map" }); setPreview(""); setMessage(""); onConfirm(null);
  };
  const confirm = async () => {
    if (!candidate || !available) return;
    const current = ++generation.current; setBusy(true); setMessage("");
    try {
      const proof = await customerRequest<{ validationToken: string }>("/api/locations/confirm", "POST", { latitude: candidate.latitude, longitude: candidate.longitude });
      if (!active.current || current !== generation.current) return;
      onConfirm({ ...candidate, confirmed: true, validationToken: proof.validationToken }); setCandidate(null); setPreview("");
    } catch { if (active.current && current === generation.current) setMessage("Titik belum dapat dikonfirmasi untuk pengiriman Indonesia. Pilih titik lain atau gunakan alamat manual."); }
    finally { if (active.current && current === generation.current) setBusy(false); }
  };
  return <div className="location-picker">
    <div className="location-actions">
      <button type="button" className="button primary" onClick={locate} disabled={busy}>Gunakan lokasi saya</button>
      <button type="button" className="button warm" onClick={() => setSearching(true)} disabled={!available || busy}>Cari alamat di Google Maps</button>
      <button type="button" className="text-button" onClick={manual}>Masukkan alamat manual</button>
    </div>
    {!available && <p className="checkout-note">Peta belum tersedia. Alamat manual tetap bisa digunakan.</p>}
    {searching && <div className="location-search"><label htmlFor={manualId + "-search"}>Cari lokasi di Indonesia</label><input id={manualId + "-search"} type="search" value={search} maxLength={160} onChange={event => { setSearch(event.target.value); setSuggestions([]); }} autoComplete="off" />
      {suggestions.length > 0 && <ul aria-label="Hasil pencarian lokasi">{suggestions.map(row => <li key={row.id}><button type="button" onClick={() => choose(row)}>{row.label}</button></li>)}</ul>}
      <p className="maps-attribution">Google Maps</p>
    </div>}
    {busy && <p role="status">Mencari lokasi…</p>}
    {message && <p role="status">{message}</p>}
    {candidate && <>
      {available && <DeliveryMap point={candidate} onChange={moved} />}
      {preview && <p className="location-preview">Perkiraan lokasi: {preview}<span className="maps-attribution">Google Maps</span></p>}
      <button type="button" className="button warm" disabled={!available || busy || (candidate.accuracyMeters ?? 0) > 250} onClick={confirm}>Konfirmasi titik pengiriman</button>
    </>}
    {pin && <p role="status">Titik pengiriman sudah dikonfirmasi. <button type="button" className="text-button" onClick={() => onConfirm(null)}>Hapus titik</button></p>}
  </div>;
}
