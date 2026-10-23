"use client";
import { useEffect, useState } from "react";
import type { CustomerAddress, DeliveryAddressInput } from "@yubie/domain";
import { normalizeDeliveryAddress } from "@yubie/domain";
import { customerRequest } from "@/lib/customer-api";
import { AddressEditor, emptyDeliveryAddress } from "./address-editor";

export function AddressBook({ mapsAvailable }: { mapsAvailable: boolean }) {
  const [rows, setRows] = useState<CustomerAddress[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [open, setOpen] = useState(false), [message, setMessage] = useState("");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [value, setValue] = useState<DeliveryAddressInput>(emptyDeliveryAddress);
  useEffect(() => {
    let active = true;
    fetch("/api/account/addresses", { cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok || !result.ok || !Array.isArray(result.data)) throw new Error(); if (active) setRows(result.data); })
      .catch(() => { if (active) setMessage("Alamat belum dapat dimuat. Coba muat ulang halaman."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); const normalized = normalizeDeliveryAddress(value);
    if (!normalized) { setMessage("Periksa nomor penerima, alamat lengkap, dan kode pos lima digit."); return; }
    setBusy(true); setMessage("");
    try {
      const original = rows.find(row => row.id === editing);
      const { pin, ...details } = normalized;
      const payload = original && value.pin === original.pin ? details : { ...details, ...(pin === undefined ? {} : { pin }) };
      const row = await customerRequest<CustomerAddress>(editing ? `/api/account/addresses/${encodeURIComponent(editing)}` : "/api/account/addresses", editing ? "PATCH" : "POST", payload);
      setRows(previous => [...previous.filter(item => item.id !== row.id), row]); setOpen(false); setEditing(null); setValue(emptyDeliveryAddress()); setMessage("Alamat tersimpan.");
    } catch { setMessage("Alamat belum tersimpan. Coba lagi; data formulir tetap tersedia."); } finally { setBusy(false); }
  };
  const changeDefault = async (id: string) => {
    setBusy(true); setMessage("");
    try { await customerRequest("/api/account/default-address", "PUT", { addressId: id }); setRows(previous => previous.map(row => ({ ...row, isDefault: row.id === id }))); }
    catch { setMessage("Alamat utama belum berubah. Coba lagi."); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setMessage("");
    try {
      await customerRequest(`/api/account/addresses/${encodeURIComponent(id)}`, "DELETE");
      const response = await fetch("/api/account/addresses", { cache: "no-store" }), result = await response.json();
      if (!response.ok || !result.ok) throw new Error(); setRows(result.data); setMessage("Alamat dihapus.");
    } catch { setMessage("Daftar alamat belum dapat diperbarui. Muat ulang untuk memeriksanya."); } finally { setBusy(false); }
  };
  return <section className="address-book" aria-labelledby="address-book-title">
    <div className="address-book-heading"><h2 id="address-book-title">Alamat saya</h2><button type="button" className="button warm" disabled={busy || loading} onClick={() => { setEditorEpoch(epoch => epoch + 1); setEditing(null); setValue(emptyDeliveryAddress()); setOpen(true); setMessage(""); }}>Tambah alamat</button></div>
    {message && <p role="status">{message}</p>}
    {loading ? <p aria-busy="true">Memuat alamat…</p> : rows.length === 0 && !open ? <p className="checkout-note">Simpan alamat agar lebih mudah memilih pengiriman berikutnya.</p> : null}
    <ul className="address-list">{rows.map(row => <li key={row.id}>
      <div><strong>{row.address.label}</strong>{row.isDefault && <span className="address-default">Utama</span>}</div>
      <p>{row.address.recipientName}<br />{row.address.fullAddress}<br />{row.address.city}, {row.address.province} {row.address.postalCode}</p>
      <div className="address-row-actions"><button type="button" className="text-button" disabled={busy} onClick={() => { setEditorEpoch(epoch => epoch + 1); setEditing(row.id); setValue({ ...row.address, ...(row.pin ? { pin: row.pin } : {}) }); setOpen(true); setMessage(""); }}>Ubah alamat</button>
        {!row.isDefault && <button type="button" className="text-button" disabled={busy} onClick={() => changeDefault(row.id)}>Jadikan utama</button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => remove(row.id)}>Hapus alamat</button></div>
    </li>)}</ul>
    {open && <form onSubmit={save} className="address-book-form" aria-label={editing ? "Ubah alamat" : "Tambah alamat"}>
      <AddressEditor key={editorEpoch} value={value} onChange={setValue} prefix="saved-address" mapsAvailable={mapsAvailable} />
      <div className="address-row-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan alamat"}</button><button className="text-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Batal</button></div>
    </form>}
  </section>;
}
