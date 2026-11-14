import assert from "node:assert/strict";
import test from "node:test";
import { renderB2bEnquiryNotification, renderB2bEnquiryAcknowledgement } from "../dist/index.js";

const LEAD = {
  id: "b2b_unit_1",
  name: "Budi <Santoso>",
  business: "Warung Budi",
  type: "Bakery",
  city: "Bandung",
  email: "budi@warung.id",
  whatsapp: "+62812345678",
  need: "20 kg",
  intent: "bulk",
  interest: "Yubie Flour",
  message: "Kami butuh pasokan bulanan.\nTerima kasih.",
  status: "new",
  source: "web",
  consentVersion: "2026-10",
  consentedAt: "2026-11-12T00:00:00.000Z",
  createdAt: "2026-11-12T00:00:00.000Z",
  updatedAt: "2026-11-12T00:00:00.000Z",
};

test("notification maps every submitted field with the form's Indonesian labels", () => {
  const mail = renderB2bEnquiryNotification(LEAD);
  for (const label of ["Nama", "Nama bisnis", "Jenis bisnis", "Kota", "Email", "WhatsApp", "Estimasi kebutuhan / bulan", "Jenis kebutuhan", "Produk yang diminati", "Pesan"]) {
    assert.ok(mail.text.includes(label + ":"), `missing label ${label}`);
  }
  assert.ok(mail.text.includes("Budi <Santoso>"));
  assert.ok(mail.text.includes("Konsultasi bulk ingredients"));
  assert.ok(mail.text.includes("budi@warung.id"));
  assert.ok(mail.subject.includes("[B2B Enquiry]"));
  assert.ok(mail.subject.includes("Warung Budi"));
  assert.ok(mail.subject.includes("Bandung"));
  assert.ok(!mail.text.includes("celiac") && !mail.text.includes("diet") && !mail.text.includes("kesehatan"), "renderer must not invent claims");
  assert.ok(mail.html.includes("Konsultasi bulk ingredients"));
});

test("notification escapes user content in HTML and keeps newlines in text", () => {
  const mail = renderB2bEnquiryNotification({ ...LEAD, name: "<script>alert(1)</script>" });
  assert.ok(!mail.html.includes("<script>alert(1)</script>"), "user content must be escaped in HTML");
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.text.includes("Kami butuh pasokan bulanan.\nTerima kasih."));
});

test("optional fields render as dash instead of undefined", () => {
  const mail = renderB2bEnquiryNotification({ ...LEAD, need: "   ", message: null });
  assert.ok(mail.text.includes("Estimasi kebutuhan / bulan: -"));
  assert.ok(!mail.text.includes("undefined"));
  const subjectMail = renderB2bEnquiryNotification({ ...LEAD, intent: "unknown-intent" });
  assert.ok(subjectMail.subject.includes("Pertanyaan B2B umum"), "unknown intents fall back to the general label");
});

test("acknowledgment is a receipt, never an availability promise", () => {
  const mail = renderB2bEnquiryAcknowledgement(LEAD, { teamReplyTo: "hello@yubiefood.com" });
  assert.ok(mail.text.includes("Terima kasih"));
  assert.ok(mail.text.includes("1-2 hari kerja"));
  assert.ok(mail.text.includes("Ketersediaan sampel dikonfirmasi secara terpisah"));
  assert.ok(mail.text.includes("hello@yubiefood.com"));
  assert.ok(mail.text.includes("budi@warung.id"), "receipt echoes the submitter's own data back to them");
  assert.ok(!/sampel (tersedia|siap)|stok (tersedia|siap|ada)|produk tersedia/i.test(mail.text), "no availability promise wording");
  assert.ok(mail.text.includes("bukan konfirmasi ketersediaan"), "the receipt explicitly disclaims availability");
});
