"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { B2BLead } from "@yubie/validation";
import { trackEvent } from "../../lib/analytics";

// Localized messages stay client-side; the structural contract (fields, caps,
// enums, optional-ness) is compile-time pinned to the shared server schema —
// a drift on either side breaks this assignment.
const schema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  business: z.string().trim().min(2, "Nama bisnis wajib diisi.").max(120),
  type: z.string().min(1, "Pilih jenis bisnis.").max(60),
  city: z.string().trim().min(2, "Kota wajib diisi.").max(80),
  email: z.string().email("Email tidak valid."),
  whatsapp: z.string().trim().min(8, "Nomor WhatsApp tidak valid.").max(24),
  need: z.string().trim().max(120).optional(),
  intent: z.enum(["sample", "bulk", "product-development", "general"]),
  interest: z.string().min(1, "Pilih produk.").max(120),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { error: "Persetujuan diperlukan." }),
  website: z.string().max(200).optional(),
});
const _serverContract: z.ZodType<B2BLead> = schema;
void _serverContract;
type Data = z.infer<typeof schema>;

const intentLabels: Record<Data["intent"], string> = {
  sample: "Minta sampel produk",
  bulk: "Konsultasi bulk ingredients",
  "product-development": "Pengembangan produk bersama",
  general: "Pertanyaan B2B umum",
};

export function B2BForm() {
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const sendInFlightRef = useRef(false);
  // An editable website preview (not a mail-client draft). No server write
  // occurs until the prospect explicitly confirms the reviewed payload.
  const [review, setReview] = useState<Data | null>(null);
  const searchParams = useSearchParams();
  const defaultIntent = (searchParams.get("intent") as Data["intent"] | null) ?? "general";
  const defaultInterest = searchParams.get("interest") ?? "";
  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting } } = useForm<Data>({
    resolver: zodResolver(schema),
    defaultValues: { intent: ["sample", "bulk", "product-development", "general"].includes(defaultIntent) ? defaultIntent : "general", interest: defaultInterest },
  });
  const intent = useWatch({ control, name: "intent" });

  useEffect(() => {
    if (defaultInterest) setValue("interest", defaultInterest === "flour" ? "Yubie Flour" : defaultInterest);
  }, [defaultInterest, setValue]);

  const submit = async (data: Data) => {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/b2b", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("Submission unavailable");
      trackEvent("b2b_enquiry_submit", { intent: data.intent });
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };
  if (sent) return <div className="b2b-success" role="status"><span>01</span><h2>Enquiry Anda telah kami terima.</h2><p>Tim kami akan menindaklanjuti melalui email atau WhatsApp dalam 1–2 hari kerja. Ketersediaan sampel dikonfirmasi secara terpisah oleh tim.</p></div>;
  if (review) {
    const previewFields = [
      ["Nama", review.name],
      ["Nama bisnis", review.business],
      ["Jenis bisnis", review.type],
      ["Kota", review.city],
      ["Email", review.email],
      ["WhatsApp", review.whatsapp],
      ["Estimasi kebutuhan / bulan", review.need || "Belum diisi"],
      ["Jenis kebutuhan", intentLabels[review.intent]],
      ["Produk yang diminati", review.interest],
      ["Pesan", review.message || "Belum diisi"],
    ];
    return <section className="b2b-review" aria-labelledby="b2b-review-title">
      <span className="eyebrow">STEP 02 — REVIEW</span>
      <h3 id="b2b-review-title">Tinjau enquiry Anda</h3>
      <p>Ini adalah pratinjau, belum dikirim. Periksa seluruh jawaban sebelum mengirimnya kepada tim Yubie.</p>
      <dl>{previewFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="b2b-review-consent">Persetujuan pemrosesan data: Disetujui.</p>
      {failed && <p role="alert">Enquiry belum terkonfirmasi. Silakan coba kirim kembali atau ubah jawaban Anda.</p>}
      <div className="b2b-review-actions">
        <button type="button" className="button" disabled={sending} onClick={() => { setFailed(false); setReview(null); }}>Ubah jawaban</button>
        <button type="button" className="button gold" disabled={sending} onClick={() => void submit(review)}>{sending ? "Mengirim…" : "Kirim enquiry"} <span aria-hidden="true">→</span></button>
      </div>
    </section>;
  }
  return <form className="b2b-form" onSubmit={handleSubmit((data) => { setFailed(false); setReview(data); })} noValidate>
    <input {...register("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
    <label>Nama<input {...register("name")} aria-invalid={!!errors.name} />{errors.name && <small>{errors.name.message}</small>}</label>
    <label>Nama bisnis<input {...register("business")} aria-invalid={!!errors.business} />{errors.business && <small>{errors.business.message}</small>}</label>
    <label>Jenis bisnis<select {...register("type")} defaultValue="" aria-invalid={!!errors.type}><option value="" disabled>Pilih</option><option>Bakery</option><option>Café</option><option>Food Manufacturer</option><option>Retailer</option><option>UMKM Kuliner</option><option>Lainnya</option></select>{errors.type && <small>{errors.type.message}</small>}</label>
    <label>Kota<input {...register("city")} aria-invalid={!!errors.city} />{errors.city && <small>{errors.city.message}</small>}</label>
    <label>Email<input type="email" {...register("email")} aria-invalid={!!errors.email} />{errors.email && <small>{errors.email.message}</small>}</label>
    <label>WhatsApp<input {...register("whatsapp")} inputMode="tel" aria-invalid={!!errors.whatsapp} />{errors.whatsapp && <small>{errors.whatsapp.message}</small>}</label>
    <label>Estimasi kebutuhan / bulan<input {...register("need")} placeholder="Contoh: 20 kg" /></label>
    <label>Jenis kebutuhan<select {...register("intent")}>{Object.entries(intentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.intent && <small>{errors.intent.message}</small>}</label>
    <label>Produk yang diminati<select {...register("interest")} defaultValue="" aria-invalid={!!errors.interest}><option value="" disabled>Pilih</option><option>Yubie Flour</option><option>Yubie Shake</option><option>Yubie Ppang</option><option>Yubie Mie</option><option>Collaboration</option></select>{errors.interest && <small>{errors.interest.message}</small>}</label>
    <label className="wide">Pesan<textarea {...register("message")} rows={5} placeholder={intent === "sample" ? "Ceritakan use case sampel yang Anda butuhkan." : intent === "bulk" ? "Ceritakan volume dan jadwal kebutuhan bulk." : "Ceritakan kebutuhan Anda."} /></label>
    <label className="check wide"><input type="checkbox" {...register("consent")} /><span>Saya setuju data ini diproses untuk menindaklanjuti enquiry dan telah membaca <a href="/privacy">Privacy Policy</a>.</span></label>{errors.consent && <small className="wide">{errors.consent.message}</small>}
    {failed && <p className="wide" role="alert">Enquiry belum terkonfirmasi. Data tetap tersimpan di formulir; coba lagi.</p>}
    <button type="submit" className="button gold wide" disabled={isSubmitting}>{isSubmitting ? "Memeriksa…" : "Tinjau enquiry"}<span aria-hidden="true">→</span></button>
  </form>;
}
