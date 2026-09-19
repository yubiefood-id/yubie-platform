import { z } from "zod";

export const attributionQuerySchema = z.object({
  source: z.string().trim().max(40).optional(),
  campaign: z.string().trim().max(40).optional(),
  placement: z.string().trim().max(40).optional(),
  productId: z.string().trim().max(40).optional(),
  rootId: z.string().trim().max(40).optional(),
});

export const purchaseOptionsResponseSchema = z.object({
  data: z.object({
    productSlug: z.string(),
    productId: z.string(),
    options: z.array(z.union([
      z.object({
        kind: z.literal("marketplace"),
        listingKey: z.string(),
        marketplace: z.enum(["shopee", "tokopedia"]),
        label: z.string(),
        redirectPath: z.string(),
        productId: z.string(),
        skuId: z.string().optional(),
      }),
      z.object({
        kind: z.literal("whatsapp"),
        intentKey: z.string(),
        label: z.string(),
        redirectPath: z.string(),
        productId: z.string().optional(),
        rootId: z.string().optional(),
      }),
    ])),
  }),
});
