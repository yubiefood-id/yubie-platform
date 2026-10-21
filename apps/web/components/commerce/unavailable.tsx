import Link from "next/link";
import { siteConfig } from "@/config/site";

export function CommerceUnavailable() {
  return <main id="main" className="legal-page">
    <span className="eyebrow">KATALOG YUBIE</span>
    <h1>Transaksi langsung belum tersedia.</h1>
    <p>Situs ini menyediakan informasi katalog. Akun, keranjang, pembayaran dan pengecekan pesanan langsung belum tersedia di sini.</p>
    <p><Link className="button primary" href="/products">Lihat katalog produk</Link></p>
    <p>Untuk pertanyaan, <a href={`mailto:${siteConfig.email}`}>hubungi Yubie</a>.</p>
  </main>;
}
