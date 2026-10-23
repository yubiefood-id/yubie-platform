import { normalizePhone } from "./phone.js";

export interface AddressDetails {
  label: string; recipientName: string; recipientPhone: string; fullAddress: string;
  province: string; city: string; district: string; subdistrict: string;
  postalCode: string; building: string; rt: string; rw: string; notes: string; countryCode: "ID";
}
export interface DeliveryPinInput {
  latitude: number; longitude: number; source: "device" | "google" | "map";
  confirmed: true; accuracyMeters?: number | undefined;
}
export type DeliveryAddressInput = AddressDetails & { pin?: DeliveryPinInput | null };
export interface DeliveryPin extends DeliveryPinInput { confirmedAt: string; expiresAt: string; }
export interface CustomerAddress {
  id: string; userId: string; address: AddressDetails; pin: DeliveryPin | null;
  isDefault: boolean; createdAt: string; updatedAt: string;
}

/** Delivery contact is independent of login identity. Maps never proves an address. */
export function normalizeDeliveryAddress(input: DeliveryAddressInput): DeliveryAddressInput | null {
  if (input.countryCode !== "ID") return null;
  const limits = { label: [1, 40], recipientName: [2, 80], fullAddress: [8, 500], province: [2, 80], city: [2, 80], district: [0, 80], subdistrict: [0, 80], postalCode: [5, 5], building: [0, 120], rt: [0, 3], rw: [0, 3], notes: [0, 240] } as const;
  const address = { ...input };
  for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = input[field];
    if (typeof value !== "string" || value.trim().length < limits[field][0] || value.trim().length > limits[field][1] || /[\u0000-\u001f\u007f]/.test(value)) return null;
    address[field] = value.trim();
  }
  if (!/^\d{5}$/.test(address.postalCode) || !/^\d{0,3}$/.test(address.rt) || !/^\d{0,3}$/.test(address.rw)) return null;
  if (typeof input.recipientPhone !== "string") return null;
  const phone = normalizePhone(input.recipientPhone);
  if (!phone) return null;
  address.recipientPhone = phone.e164;
  const pin = input.pin;
  if (pin && (!Number.isFinite(pin.latitude) || Math.abs(pin.latitude) > 90 || !Number.isFinite(pin.longitude) || Math.abs(pin.longitude) > 180 || pin.confirmed !== true || !["device", "google", "map"].includes(pin.source) || (pin.accuracyMeters !== undefined && (!Number.isFinite(pin.accuracyMeters) || pin.accuracyMeters < 0 || pin.accuracyMeters > 100_000)))) return null;
  return address;
}
