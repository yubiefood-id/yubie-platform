import assert from "node:assert/strict";
import test from "node:test";
import { SmtpEmailSender } from "../dist/index.js";

function makeFakeTransporter(behavior) {
  const calls = [];
  const transporter = {
    sendMail: async (mail) => {
      calls.push(mail);
      return behavior(mail);
    },
    close: () => {},
  };
  const factory = () => transporter;
  factory.calls = calls;
  return factory;
}

const OPTIONS = { host: "smtp.privateemail.com", port: 465, secure: true, user: "enquiry@yubiefood.com", password: "secret-value" };
const MAIL = { from: "enquiry@yubiefood.com", to: ["hello@yubiefood.com"], replyTo: "budi@warung.id", subject: "[B2B Enquiry] t", text: "body" };

test("constructor rejects an invalid SMTP contract", () => {
  assert.throws(() => new SmtpEmailSender({ ...OPTIONS, host: "no-dot" }), /SMTP_CONFIG_INVALID/);
  assert.throws(() => new SmtpEmailSender({ ...OPTIONS, port: 25 }), /SMTP_CONFIG_INVALID/);
  assert.throws(() => new SmtpEmailSender({ ...OPTIONS, password: "" }), /SMTP_CONFIG_INVALID/);
});

test("accepted send returns the provider message id and joins recipients", async () => {
  const factory = makeFakeTransporter(async () => ({ messageId: "<m1@yubiefood.com>" }));
  const sender = new SmtpEmailSender({ ...OPTIONS, createTransportFn: factory });
  const result = await sender.send(MAIL);
  assert.equal(result.status, "accepted");
  assert.equal(result.providerMessageId, "<m1@yubiefood.com>");
  assert.equal(factory.calls[0].to, "hello@yubiefood.com");
  assert.equal(factory.calls[0].replyTo, "budi@warung.id");
});

test("an SMTP 5xx refusal is definitive (failed); timeouts stay ambiguous", async () => {
  const refused = makeFakeTransporter(async () => {
    const error = new Error("550 relay denied");
    error.responseCode = 550;
    throw error;
  });
  const refusedResult = await new SmtpEmailSender({ ...OPTIONS, createTransportFn: refused }).send(MAIL);
  assert.equal(refusedResult.status, "failed");
  assert.equal(refusedResult.errorCode, "SMTP_REJECTED_PERMANENT");

  const timedOut = makeFakeTransporter(async () => {
    throw new Error("connection timeout");
  });
  const timedOutResult = await new SmtpEmailSender({ ...OPTIONS, createTransportFn: timedOut }).send(MAIL);
  assert.equal(timedOutResult.status, "ambiguous");
  assert.equal(timedOutResult.errorCode, "SMTP_OUTCOME_UNCERTAIN");

  const throttled = makeFakeTransporter(async () => {
    const error = new Error("421 try again");
    error.responseCode = 421;
    throw error;
  });
  assert.equal((await new SmtpEmailSender({ ...OPTIONS, createTransportFn: throttled }).send(MAIL)).status, "ambiguous");
});

test("input validation refuses malformed addresses and header injection before any network call", async () => {
  const factory = makeFakeTransporter(async () => ({ messageId: "<m>" }));
  const sender = new SmtpEmailSender({ ...OPTIONS, createTransportFn: factory });
  assert.equal((await sender.send({ ...MAIL, to: ["not-an-email"] })).errorCode, "EMAIL_INPUT_INVALID");
  assert.equal((await sender.send({ ...MAIL, subject: "subj\r\nBcc: victim@x.id" })).errorCode, "EMAIL_INPUT_INVALID");
  assert.equal((await sender.send({ ...MAIL, replyTo: "a@b.com\r\n" })).errorCode, "EMAIL_INPUT_INVALID");
  assert.equal((await sender.send({ ...MAIL, text: "" })).errorCode, "EMAIL_INPUT_INVALID");
  assert.equal(factory.calls.length, 0, "invalid input must never reach the transport");
});
