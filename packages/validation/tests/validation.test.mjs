import assert from "node:assert/strict";
import test from "node:test";
import { newsletterSubmissionSchema, productWaitlistSchema } from "../dist/index.js";

test("newsletter validation requires explicit consent", () => {
  assert.equal(newsletterSubmissionSchema.safeParse({ email: "hello@yubiefood.com", consent: true }).success, true);
  assert.equal(newsletterSubmissionSchema.safeParse({ email: "hello@yubiefood.com", consent: false }).success, false);
});

test("product waitlist is scoped to a coming-soon product and explicit consent", () => {
  assert.equal(productWaitlistSchema.safeParse({ phone: "+62812345678", productId: "shake", consent: true }).success, true);
  assert.equal(productWaitlistSchema.safeParse({ phone: "+62812345678", productId: "mie", consent: true }).success, true);
  assert.equal(productWaitlistSchema.safeParse({ phone: "+62812345678", productId: "all", consent: true }).success, true);
  assert.equal(productWaitlistSchema.safeParse({ phone: "+62812345678", productId: "flour", consent: true }).success, false);
  assert.equal(productWaitlistSchema.safeParse({ phone: "123", productId: "ppang", consent: true }).success, false);
  assert.equal(productWaitlistSchema.safeParse({ phone: "+62812345678", productId: "ppang", consent: false }).success, false);
});
