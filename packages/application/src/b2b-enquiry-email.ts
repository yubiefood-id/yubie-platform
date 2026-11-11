import type { B2bLeadRecord } from "./ports.js";

/**
 * Pure renderers for the two B2B enquiry emails. These echo exactly what the
 * business submitted — no product, nutrition, health or certification
 * statements are generated here (AGENTS.md §1: the form answer is a lead, not
 * label approval).
 */

export const B2B_INTENT_LABELS: Record<string, string> = {
  sample: "Minta sampel produk",
  bulk: "Konsultasi bulk ingredients",
  "product-development": "Pengembangan produk bersama",
  general: "Pertanyaan B2B umum",
};

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function intentLabel(intent: string): string {
  return B2B_INTENT_LABELS[intent] ?? "Pertanyaan B2B umum";
}

function subjectFor(lead: B2bLeadRecord): string {
  const business = lead.business.trim().slice(0, 60);
  return `[B2B Enquiry] ${intentLabel(lead.intent)} — ${business} (${lead.city.trim().slice(0, 40)})`;
}

function fields(lead: B2bLeadRecord): Array<{ label: string; value: string }> {
  return [
    { label: "Nama", value: lead.name },
    { label: "Nama bisnis", value: lead.business },
    { label: "Jenis bisnis", value: lead.type },
    { label: "Kota", value: lead.city },
    { label: "Email", value: lead.email },
    { label: "WhatsApp", value: lead.whatsapp },
    { label: "Estimasi kebutuhan / bulan", value: lead.need?.trim() ? lead.need.trim() : "-" },
    { label: "Jenis kebutuhan", value: intentLabel(lead.intent) },
    { label: "Produk yang diminati", value: lead.interest },
    { label: "Pesan", value: lead.message?.trim() ? lead.message.trim() : "-" },
  ];
}

function footer(lead: B2bLeadRecord): string[] {
  return [
    "---",
    `ID enquiry: ${lead.id}`,
    `Waktu submit: ${lead.createdAt}`,
    `Sumber: ${lead.source}`,
    "Persetujuan pemrosesan data: disetujui pengirim saat submit (Privacy Policy).",
  ];
}

function renderHtml(rows: Array<{ label: string; value: string }>, footerLines: string[], heading: string, intro: string): string {
  const body = rows
    .map((row) => `<tr><th style="text-align:left;padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</th><td style="padding:6px 0;vertical-align:top;">${escapeHtml(row.value).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  return [
    `<h2 style="margin:0 0 12px;">${escapeHtml(heading)}</h2>`,
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    `<table style="border-collapse:collapse;font-size:14px;">${body}</table>`,
    `<p style="margin:16px 0 0;color:#555;font-size:12px;white-space:pre-line;">${escapeHtml(footerLines.join("\n"))}</p>`,
  ].join("\n");
}

/** Internal notification: every submitted field, Reply-To set by the caller to the lead's email. */
export function renderB2bEnquiryNotification(lead: B2bLeadRecord): RenderedEmail {
  const rows = fields(lead);
  const footerLines = footer(lead);
  const text = [
    "Enquiry B2B baru dari situs yubiefood.com.",
    "",
    ...rows.map((row) => `${row.label}: ${row.value}`),
    "",
    ...footerLines,
    "",
    "Balas email ini untuk menghubungi pengirim (Reply-To = email pengirim).",
  ].join("\n");
  return {
    subject: subjectFor(lead),
    text,
    html: renderHtml(rows, footerLines, "Enquiry B2B baru", "Enquiry B2B baru dari situs yubiefood.com."),
  };
}

/**
 * Customer acknowledgment: transactional receipt of what they submitted with
 * the team inbox as Reply-To. Sample availability is explicitly deferred to
 * the team — no availability or product promise is made by this email.
 */
export function renderB2bEnquiryAcknowledgement(lead: B2bLeadRecord, options: { teamReplyTo: string }): RenderedEmail {
  const rows = fields(lead);
  const footerLines = [
    "---",
    "Pesan ini dikirim otomatis sebagai tanda terima, bukan konfirmasi ketersediaan.",
    `Ada pertanyaan? Balas email ini atau hubungi kami di ${options.teamReplyTo}.`,
    "Yubie — yubiefood.com",
  ];
  const text = [
    `Terima kasih, ${lead.name.trim()}!`,
    "",
    "Enquiry B2B Anda sudah kami terima. Tim kami akan menindaklanjuti melalui email atau WhatsApp dalam 1-2 hari kerja.",
    "Ketersediaan sampel dikonfirmasi secara terpisah oleh tim.",
    "",
    "Ringkasan yang Anda kirim:",
    ...rows.map((row) => `- ${row.label}: ${row.value}`),
    "",
    ...footerLines,
  ].join("\n");
  return {
    subject: `Terima kasih — enquiry B2B Anda sudah kami terima (${lead.business.trim().slice(0, 60)})`,
    text,
    html: renderHtml(
      rows,
      footerLines,
      "Enquiry B2B Anda sudah kami terima",
      "Tim kami akan menindaklanjuti melalui email atau WhatsApp dalam 1-2 hari kerja. Ketersediaan sampel dikonfirmasi secara terpisah oleh tim.",
    ),
  };
}
