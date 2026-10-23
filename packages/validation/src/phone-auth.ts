import { z } from "zod";
export const phoneChallengeSchema = z.object({ phone: z.string().trim().min(4).max(40), country: z.string().regex(/^[A-Z]{2}$/).default("ID"), purpose: z.enum(["login", "link_phone", "reauth"]).default("login"), captchaToken: z.string().min(1).max(2048) }).strict();
export const phoneVerifySchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
