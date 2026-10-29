import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

test("private browser failure diagnostics remove credentials, emails, URLs and phones", () => {
  const program = `import {redactPublicDiagnostic} from './e2e/support/p0-diagnostics.ts';
    const input='owner@example.invalid https://example.invalid/?token=opaque token=private-value +6281234567890 '+('a'.repeat(24)+'.'+'b'.repeat(24)+'.'+'c'.repeat(24));
    console.log(JSON.stringify(redactPublicDiagnostic(input)));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" }));
  for (const secret of ["owner@example.invalid", "example.invalid", "opaque", "private-value", "6281234567890", "a".repeat(24)]) assert.equal(result.includes(secret), false);
  for (const label of ["[EMAIL]", "[URL]", "[REDACTED]", "[PHONE]", "[JWT]"]) assert.ok(result.includes(label));
});
