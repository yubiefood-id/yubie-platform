"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter."),
  business: z.string().trim().min(2, "Nama bisnis wajib diisi."),
  type: z.string().min(1, "Pilih jenis bisnis."),
  city: z.string().trim().min(2, "Kota wajib diisi."),
  email: z.string().email("Email tidak valid."),
  whatsapp: z.string().trim().min(8, "Nomor WhatsApp tidak valid."),
  need: z.string().trim().optional(),
  interest: z.string().min(1, "Pilih produk."),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { error: "Persetujuan diperlukan." }),
});
type Data = z.infer<typeof schema>;

export function B2BForm() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Data>({ resolver: zodResolver(schema) });
  const submit = async (data: Data) => { const response = await fetch("/api/b2b", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); if (response.ok) setSent(true); };
  if (sent) return <div className="b2b-success" role="status"><span>01</span><h2>Enquiry tervalidasi.</h2><p>Ini adalah prototype aman. Integrasi CRM/email belum diaktifkan, jadi belum ada pesan yang dikirim keluar.</p></div>;
  return <form className="b2b-form" onSubmit={handleSubmit(submit)} noValidate>
    <label>Nama<input {...register("name")} />{errors.name && <small>{errors.name.message}</small>}</label>
    <label>Nama bisnis<input {...register("business")} />{errors.business && <small>{errors.business.message}</small>}</label>
    <label>Jenis bisnis<select {...register("type")} defaultValue=""><option value="" disabled>Pilih</option><option>Bakery</option><option>Café</option><option>Food Manufacturer</option><option>Retailer</option><option>UMKM Kuliner</option><option>Lainnya</option></select>{errors.type && <small>{errors.type.message}</small>}</label>
    <label>Kota<input {...register("city")} />{errors.city && <small>{errors.city.message}</small>}</label>
    <label>Email<input type="email" {...register("email")} />{errors.email && <small>{errors.email.message}</small>}</label>
    <label>WhatsApp<input {...register("whatsapp")} inputMode="tel" />{errors.whatsapp && <small>{errors.whatsapp.message}</small>}</label>
    <label>Estimasi kebutuhan / bulan<input {...register("need")} placeholder="Contoh: 20 kg" /></label>
    <label>Produk yang diminati<select {...register("interest")} defaultValue=""><option value="" disabled>Pilih</option><option>Yubie Flour</option><option>Yubie Shake</option><option>Yubie Ppang</option><option>Collaboration</option></select>{errors.interest && <small>{errors.interest.message}</small>}</label>
    <label className="wide">Pesan<textarea {...register("message")} rows={5} /></label>
    <label className="check wide"><input type="checkbox" {...register("consent")} /><span>Saya setuju data ini diproses untuk menindaklanjuti enquiry dan telah membaca <a href="/privacy">Privacy Policy</a>.</span></label>{errors.consent && <small className="wide">{errors.consent.message}</small>}
    <button className="button gold wide" disabled={isSubmitting}>{isSubmitting ? "Validating…" : "Send sample request"}<span>→</span></button>
  </form>;
}
