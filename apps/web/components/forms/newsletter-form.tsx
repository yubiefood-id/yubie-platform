"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().max(50).optional(),
  email: z.string().trim().email("Masukkan alamat email yang valid."),
  consent: z.literal(true, { error: "Persetujuan diperlukan." }),
});
type FormData = z.infer<typeof schema>;

export function NewsletterForm() {
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });
  const onSubmit = async (data: FormData) => {
    setFailed(false);
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("Submission unavailable");
      setSent(true);
    } catch { setFailed(true); }
  };
  if (sent) return <div className="form-success" role="status"><span>✓</span><strong>Welcome to the roots.</strong><p>Email tervalidasi. Integrasi pengiriman update akan diaktifkan saat peluncuran.</p></div>;
  return <form className="newsletter-form" onSubmit={handleSubmit(onSubmit)} noValidate>
    <label><span>Nama (opsional)</span><input {...register("name")} placeholder="Nama kamu" /></label>
    <label><span>Email</span><input {...register("email")} type="email" placeholder="you@example.com" aria-invalid={!!errors.email} />{errors.email && <small>{errors.email.message}</small>}</label>
    <label className="consent"><input {...register("consent")} type="checkbox" /><span>Saya setuju menerima update Yubie dan telah membaca <a href="/privacy">Privacy Policy</a>.</span></label>{errors.consent && <small>{errors.consent.message}</small>}
    {failed && <p role="alert">Pendaftaran belum terkonfirmasi. Data tetap tersimpan di formulir; coba lagi.</p>}
    <button className="button gold" disabled={isSubmitting}>{isSubmitting ? "Joining…" : "Join the Yubie Community"}<span>→</span></button>
  </form>;
}
