import { customerAddressSchema } from "./delivery-address.js";
import { z } from "zod";

export const newsletterSubmissionSchema = z.object({
  name: z.string().trim().max(50).optional(),
  email: z.email(),
  consent: z.literal(true),
});

export const productWaitlistSchema = z.object({
  phone: z.string().trim().min(8).max(24),
  productId: z.enum(["shake", "ppang", "mie", "all"]),
  consent: z.literal(true),
});

export const b2bLeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  business: z.string().trim().min(2).max(120),
  type: z.string().trim().min(1).max(60),
  city: z.string().trim().min(2).max(80),
  email: z.email(),
  whatsapp: z.string().trim().min(8).max(24),
  need: z.string().trim().max(120).optional(),
  intent: z.enum(["sample", "bulk", "product-development", "general"]).default("general"),
  interest: z.string().trim().min(1).max(120),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
});

export const checkoutLineSchema = z.object({
  productId: z.string().trim().min(1).max(80),
  sizeId: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(20),
});

export const checkoutDeliverySchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(8).max(24),
  address: z.string().trim().min(8).max(240),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().max(12).optional(),
  notes: z.string().trim().max(240).optional(),
});

export const checkoutRequestSchema = z.object({
  lines: z.array(checkoutLineSchema).min(1).max(25),
  customerEmail: z.email(),
  customerName: z.string().trim().max(80).optional(),
  delivery: checkoutDeliverySchema.optional(),
  promoCode: z.string().trim().max(32).optional(),
});

/** Explicit V3 contract; the legacy route keeps its V1 contract until adapted. */
export const checkoutV3RequestSchema = z.object({
  checkoutVersion: z.literal(3),
  lines: z.array(checkoutLineSchema).min(1).max(25),
  contact: z.object({
    phone: z.string().trim().min(4).max(40),
    country: z.string().regex(/^[A-Z]{2}$/).default("ID"),
    name: z.string().trim().max(80).optional(),
    email: z.email().nullable().optional(),
  }).strict(),
  delivery: customerAddressSchema,
  promoCode: z.string().trim().max(32).optional(),
}).strict();
export type CheckoutV3Request = z.infer<typeof checkoutV3RequestSchema>;

export const googleLoginSchema = z.object({
  credential: z.string().min(16).max(4096),
  g_csrf_token: z.string().min(1).max(256),
});

export type NewsletterSubmission = z.infer<typeof newsletterSubmissionSchema>;
export type ProductWaitlistSubmission = z.infer<typeof productWaitlistSchema>;
export type B2BLead = z.infer<typeof b2bLeadSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export const inventoryOnboardingSchema = z.object({
  operationId:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),actor:z.string().trim().min(1).max(100),reason:z.string().trim().min(1).max(300),
  countedAt:z.iso.datetime(),policies:z.array(z.object({
    productId:z.string().min(1),sizeId:z.string().min(1),version:z.number().int().positive(),approvalRef:z.string().trim().min(1),
    components:z.array(z.object({productId:z.string().min(1),sizeId:z.string().min(1),quantity:z.number().int().positive()}).strict()).min(1),
  }).strict()).max(9),
  lots:z.array(z.object({
    productId:z.string().min(1),sizeId:z.string().min(1),lotCode:z.string().trim().min(1).max(100),unitOfMeasure:z.string().trim().min(1).max(40),
    expiryDate:z.iso.date(),countedUncommittedQuantity:z.number().int().nonnegative(),expectedAvailable:z.number().int().nonnegative(),
    status:z.enum(["received","quarantined","released","recalled","depleted"]),qcApprovalRef:z.string().trim().max(200).optional(),
  }).strict()).min(1).max(100),
}).strict();
const operationalReference = z.string().trim().min(1).max(300).refine(value => !/(?:^|[\s_-])(PENDING|PROPOSED|MISSING|BELUM|USULAN|NOT_FOR_IMPORT)(?:$|[\s_-])/i.test(value), "Bukti asli diperlukan; placeholder/usulan tidak diterima");
export const operationalVerificationSchema = z.object({
  status: z.literal("VERIFIED"), evidenceRef: operationalReference, verifiedBy: operationalReference, verifiedAt: z.iso.datetime(),
}).strict();
export const verifiedInventoryIntakeSchema = z.object({
  documentType: z.literal("YUBIE_VERIFIED_INVENTORY_INTAKE_V1"), purpose: z.enum(["initial_inventory", "operational_count"]),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), verification: operationalVerificationSchema, inventory: inventoryOnboardingSchema,
}).strict();
export const shippingPolicyDraftSchema = z.object({
  scope: z.literal("whole_city"),
  policy: z.literal("free_promotional"), cities: z.array(operationalReference).min(1).max(100), amount: z.literal(0),
  serviceCoverage: operationalReference, costOwner: operationalReference, startsAt: z.iso.datetime(), endsAt: z.iso.datetime(),
  approvalRef: operationalReference, verification: operationalVerificationSchema,
}).strict().refine(input => Date.parse(input.endsAt) > Date.parse(input.startsAt), "Waktu akhir harus sesudah waktu mulai")
  .refine(input => new Set(input.cities.map(city => city.normalize("NFKC").trim().toLowerCase())).size === input.cities.length, "Kota tidak boleh duplikat");
export const operationsApprovalSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }).strict();
export const exceptionTriageSchema = z.object({ expectedVersion: z.number().int().nonnegative(), state: z.enum(["investigating", "escalated", "resolved"]), reason: z.string().trim().min(3).max(300) }).strict();
export const operationsCreateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inventory_count"), payload: verifiedInventoryIntakeSchema }).strict(),
  z.object({ kind: z.literal("shipping_policy"), payload: shippingPolicyDraftSchema }).strict(),
  z.object({ kind: z.literal("refund_full"), payload: z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), amount: z.number().int().positive(), reason: z.string().trim().min(3).max(300), evidenceRef: operationalReference }).strict() }).strict(),
]);
export const fulfillmentCommandSchema = z.object({
  expectedVersion: z.number().int().nonnegative(), stage: z.enum(["packing", "packed", "shipped", "delivered"]),
  carrier: z.string().trim().min(1).max(100).optional(), trackingNumber: z.string().trim().min(1).max(120).optional(), reason: z.string().trim().min(3).max(300),
}).strict();
export const operationNoteSchema = z.object({ body: z.string().trim().min(1).max(1000), reason: z.string().trim().min(3).max(300) }).strict();
export const refundExecutionSchema = z.object({ expectedVersion: z.number().int().positive(), merchantReference: operationalReference, evidenceRef: operationalReference, reason: z.string().trim().min(3).max(300) }).strict();
export type OperationsCreate = z.infer<typeof operationsCreateSchema>;
export type ShippingPolicyDraft = z.infer<typeof shippingPolicyDraftSchema>;
export type FulfillmentCommand = z.infer<typeof fulfillmentCommandSchema>;
export const staffGrantSchema = z.object({ subject: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/), role: z.enum(["viewer", "operator", "qc", "fulfillment", "finance", "admin"]), action: z.enum(["grant", "revoke"]), approvalRef: operationalReference, reason: z.string().trim().min(3).max(300) }).strict();
export type GoogleLoginRequest = z.infer<typeof googleLoginSchema>;

export * from "./channel.js";
export * from "./yubi-ops.js";
export * from "./phone-auth.js";
export * from "./delivery-address.js";
export * from "./delivery-location.js";
export * from "./promotion.js";
