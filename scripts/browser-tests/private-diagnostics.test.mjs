import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

test("private browser failure diagnostics remove credentials, emails, URLs and phones", () => {
  const program = `import {redactPublicDiagnostic} from './e2e/support/p0-diagnostics.ts';
    const input='owner@example.invalid https://example.invalid/?token=opaque +6281234567890 '+('a'.repeat(24)+'.'+'b'.repeat(24)+'.'+'c'.repeat(24))+'\\ntoken=private-value';
    console.log(JSON.stringify(redactPublicDiagnostic(input)));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" }));
  for (const secret of ["owner@example.invalid", "example.invalid", "opaque", "private-value", "6281234567890", "a".repeat(24)]) assert.equal(result.includes(secret), false);
  for (const label of ["[EMAIL]", "[URL]", "[REDACTED]", "[PHONE]", "[JWT]"]) assert.ok(result.includes(label));
});

test("diagnostics discard entire sensitive header lines including schemes and multiple cookies", () => {
  const program = `import {redactPublicDiagnostic} from './e2e/support/p0-diagnostics.ts';
    // Assemble this synthetic header at runtime so the source secret scanner
    // can continue rejecting literal bearer credentials without exemptions.
    const bearer='SYNTHETIC_OPAQUE_ACCESS_VALUE';
    const input='authorization: Bearer '+bearer+' cookie: first=one; second=SYNTHETIC_SESSION_VALUE\\n"cookie": "session=SYNTHETIC_COOKIE_VALUE; csrf=SYNTHETIC_CSRF_VALUE"\\ncredential: multi word SYNTHETIC_SECRET_VALUE\\nHTTP 503';
    console.log(JSON.stringify(redactPublicDiagnostic(input)));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" }));
  assert.equal(result.includes("SYNTHETIC_"), false);
  assert.ok(result.includes("HTTP 503"));
});
