import { z } from "zod";

export const newsletterSubmissionSchema = z.object({
  name: z.string().trim().max(50).optional(),
  email: z.email(),
  consent: z.literal(true),
});

export const productWaitlistSchema = z.object({
  email: z.email(),
  productId: z.enum(["shake", "ppang", "mie"]),
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
});

export const googleLoginSchema = z.object({
  credential: z.string().min(16).max(4096),
  g_csrf_token: z.string().min(1).max(256),
});

export type NewsletterSubmission = z.infer<typeof newsletterSubmissionSchema>;
export type ProductWaitlistSubmission = z.infer<typeof productWaitlistSchema>;
export type B2BLead = z.infer<typeof b2bLeadSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type GoogleLoginRequest = z.infer<typeof googleLoginSchema>;

export * from "./channel.js";
