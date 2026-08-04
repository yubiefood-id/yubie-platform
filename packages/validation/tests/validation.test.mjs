import assert from "node:assert/strict";
import test from "node:test";
import { newsletterSubmissionSchema } from "../dist/index.js";

test("newsletter validation requires explicit consent", () => {
  assert.equal(newsletterSubmissionSchema.safeParse({ email: "hello@yubiefood.id", consent: true }).success, true);
  assert.equal(newsletterSubmissionSchema.safeParse({ email: "hello@yubiefood.id", consent: false }).success, false);
});
