import { z } from "zod";
export const locationSearchSchema = z.object({ query: z.string().trim().min(3).max(160), sessionToken: z.uuid() }).strict();
export const locationDetailsSchema = z.object({ placeId: z.string().regex(/^[A-Za-z0-9_-]{4,256}$/), sessionToken: z.uuid() }).strict();
export const locationReverseSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
