import {z} from "zod";
const actor=z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
export const yubiReentrySchema=z.object({provider:z.enum(["zammad","chatwoot"]),threadId:z.string().regex(/^[1-9]\d{0,19}$/),changedBy:actor}).strict();
export const yubiFlowVersionSchema=z.object({flowVersion:z.enum(["deterministic-v1","deterministic-v2"]),releaseSha:z.string().regex(/^[a-f0-9]{40}$/),approvalRef:z.string().min(1).max(128),changedBy:actor}).strict();
