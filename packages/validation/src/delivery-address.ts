import { z } from "zod";
export const deliveryPinSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), source: z.enum(["device", "google", "map"]), confirmed: z.literal(true), accuracyMeters: z.number().min(0).max(100_000).optional(), validationToken: z.string().min(1).max(2048).optional() }).strict();
export const customerAddressSchema = z.object({
  label: z.string().trim().min(1).max(40), recipientName: z.string().trim().min(2).max(80), recipientPhone: z.string().trim().min(4).max(40), fullAddress: z.string().trim().min(8).max(500),
  province: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80), district: z.string().trim().max(80).default(""), subdistrict: z.string().trim().max(80).default(""),
  postalCode: z.string().regex(/^\d{5}$/), building: z.string().trim().max(120).default(""), rt: z.string().regex(/^\d{0,3}$/).default(""), rw: z.string().regex(/^\d{0,3}$/).default(""), notes: z.string().trim().max(240).default(""),
  countryCode: z.literal("ID").default("ID"), pin: deliveryPinSchema.nullable().optional(),
}).strict();
export const defaultAddressSchema = z.object({ addressId: z.string().regex(/^adr_[A-Za-z0-9_-]{1,96}$/) }).strict();
// Defaults apply to creation only: a PATCH must never erase omitted fields.
export const customerAddressPatchSchema = customerAddressSchema.extend({
  district: z.string().trim().max(80), subdistrict: z.string().trim().max(80), building: z.string().trim().max(120),
  rt: z.string().regex(/^\d{0,3}$/), rw: z.string().regex(/^\d{0,3}$/), notes: z.string().trim().max(240), countryCode: z.literal("ID"),
}).partial();
