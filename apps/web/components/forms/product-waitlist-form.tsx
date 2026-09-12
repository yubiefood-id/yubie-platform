"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { productWaitlistSchema, type ProductWaitlistSubmission } from "@yubie/validation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { trackEvent } from "@/lib/analytics";

export function ProductWaitlistForm({ productId, productName }: { productId: "shake" | "ppang"; productName: string }) {
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

  if (sent) return <div className="waitlist-success" role="status"><strong>Interest recorded for {productName}.</strong><p>Ini prototype aman; pengiriman notifikasi belum aktif dan Anda tidak otomatis masuk newsletter.</p></div>;

  return <form className="product-waitlist" onSubmit={handleSubmit(onSubmit)} noValidate>
    <input type="hidden" {...register("productId")} />
    <label><span>Email</span><input type="email" {...register("email")} placeholder="you@example.com" aria-invalid={!!errors.email} />{errors.email && <small>Masukkan email yang valid.</small>}</label>
    <label className="waitlist-consent"><input type="checkbox" {...register("consent")} /><span>Saya setuju dihubungi khusus mengenai {productName}. Ini tidak mendaftarkan saya ke newsletter.</span></label>
    {errors.consent && <small>Persetujuan khusus produk diperlukan.</small>}
    <button className="button gold" disabled={isSubmitting}>{isSubmitting ? "Recording…" : `Join ${productName} waitlist`} <span>→</span></button>
  </form>;
}
