"use client";
import type { DeliveryAddressInput } from "@yubie/domain";
import { LocationPicker } from "./location-picker";

export function emptyDeliveryAddress(): DeliveryAddressInput {
  return { label: "Rumah", recipientName: "", recipientPhone: "", fullAddress: "", province: "", city: "", district: "", subdistrict: "", postalCode: "", building: "", rt: "", rw: "", notes: "", countryCode: "ID" };
}
const fields = [
  ["label", "Label alamat", "text", 40, false, "off"], ["recipientName", "Nama penerima", "text", 80, true, "shipping name"],
  ["recipientPhone", "Nomor penerima", "tel", 40, true, "shipping tel"], ["province", "Provinsi", "text", 80, true, "shipping address-level1"],
  ["city", "Kota / kabupaten", "text", 80, true, "shipping address-level2"], ["district", "Kecamatan", "text", 80, false, "shipping address-level3"],
  ["subdistrict", "Kelurahan / desa", "text", 80, false, "shipping address-level4"], ["postalCode", "Kode pos", "text", 5, true, "shipping postal-code"],
  ["building", "Rumah / gedung / unit", "text", 120, false, "off"], ["rt", "RT", "text", 3, false, "off"], ["rw", "RW", "text", 3, false, "off"],
] as const;
/** Shared fields only, so checkout and account never create nested forms. */
export function AddressEditor({ value, onChange, prefix, mapsAvailable }: { value: DeliveryAddressInput; onChange(value: DeliveryAddressInput): void; prefix: string; mapsAvailable: boolean }) {
  return <fieldset className="delivery-editor"><legend>Alamat pengiriman</legend>
    <LocationPicker available={mapsAvailable} pin={value.pin} manualId={prefix + "-fullAddress"} onConfirm={pin => onChange({ ...value, pin })} />
    <p className="checkout-note">Pengiriman tersedia untuk alamat Indonesia. Lengkapi alamat sesuai tempat penerimaan; lokasi peta hanya membantu memilih titik.</p>
    <div className="address-fields">
      {fields.map(([key, text, type, max, required, autoComplete]) => <label key={key} htmlFor={prefix + "-" + key}>{text}{!required && key !== "label" ? " (opsional)" : ""}
        <input id={prefix + "-" + key} name={key} type={type} value={value[key]} maxLength={max} required={required} autoComplete={autoComplete} inputMode={key === "postalCode" || key === "rt" || key === "rw" ? "numeric" : type === "tel" ? "tel" : "text"} pattern={key === "postalCode" ? "[0-9]{5}" : undefined} onChange={event => onChange({ ...value, [key]: event.target.value })} />
      </label>)}
      <label className="address-wide" htmlFor={prefix + "-fullAddress"}>Alamat lengkap<textarea id={prefix + "-fullAddress"} name="fullAddress" value={value.fullAddress} required minLength={8} maxLength={500} autoComplete="shipping street-address" rows={3} onChange={event => onChange({ ...value, fullAddress: event.target.value })} /></label>
      <label className="address-wide" htmlFor={prefix + "-notes"}>Catatan pengiriman (opsional)<textarea id={prefix + "-notes"} value={value.notes} maxLength={240} rows={2} onChange={event => onChange({ ...value, notes: event.target.value })} /></label>
    </div>
  </fieldset>;
}
