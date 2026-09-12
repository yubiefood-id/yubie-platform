import assert from "node:assert/strict";
import test from "node:test";
import { newsletterSubmissionSchema, productWaitlistSchema } from "../dist/index.js";

test("newsletter validation requires explicit consent", () => {
  assert.equal(newsletterSubmissionSchema.safeParse({ email: "hello@yubiefood.id", consent: true }).success, true);
  assert.equal(newsletterSubmissionSchema.safeParse({ email: "hello@yubiefood.id", consent: false }).success, false);
});

test("product waitlist is scoped to a coming-soon product and explicit consent", () => {
  assert.equal(productWaitlistSchema.safeParse({ email: "hello@yubiefood.id", productId: "shake", consent: true }).success, true);
  assert.equal(productWaitlistSchema.safeParse({ email: "hello@yubiefood.id", productId: "flour", consent: true }).success, false);
  assert.equal(productWaitlistSchema.safeParse({ email: "hello@yubiefood.id", productId: "ppang", consent: false }).success, false);
});
