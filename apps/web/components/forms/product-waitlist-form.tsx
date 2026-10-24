"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { productWaitlistSchema, type ProductWaitlistSubmission } from "@yubie/validation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { trackEvent } from "@/lib/analytics";

export function ProductWaitlistForm({ productId, productName = "produk & promo Yubie" }: { productId: ProductWaitlistSubmission["productId"]; productName?: string }) {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProductWaitlistSubmission>({
    resolver: zodResolver(productWaitlistSchema),
    defaultValues: { productId, consent: false as true },
  });

  const onSubmit = async (data: ProductWaitlistSubmission) => {
    const response = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    if (response.ok) {
      setSent(true);
      trackEvent("product_waitlist_submit", { product_id: productId });
    }
  };

  if (sent) return <div className="waitlist-success" role="status"><strong>Nomor WhatsApp tercatat di waitlist.</strong><p>Kamu akan dihubungi untuk kabar {productName}. Ini bukan pendaftaran newsletter.</p></div>;

  return <form className="product-waitlist" onSubmit={handleSubmit(onSubmit)} noValidate>
    <input type="hidden" {...register("productId")} />
    <label><span>Nomor WhatsApp</span><input type="tel" {...register("phone")} placeholder="+62812…" aria-invalid={!!errors.phone} />{errors.phone && <small>Masukkan nomor WhatsApp yang valid (8–24 digit).</small>}</label>
    <label className="waitlist-consent"><input type="checkbox" {...register("consent")} /><span>Saya setuju dihubungi via nomor ini untuk kabar {productName}. Ini tidak mendaftarkan saya ke newsletter.</span></label>
    {errors.consent && <small>Persetujuan diperlukan untuk mendaftar.</small>}
    <button className="button gold" disabled={isSubmitting}>{isSubmitting ? "Mendaftarkan…" : "Daftar waitlist"} <span>→</span></button>
  </form>;
}
