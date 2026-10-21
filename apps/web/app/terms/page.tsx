import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";

export const metadata: Metadata = { title: "Terms & Conditions", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <main id="main" className="legal-page"><span className="eyebrow">TERMS</span><h1>Terms &amp; Conditions</h1>
    <h2>Status situs</h2><p>{directCommerce ? "Ini adalah lingkungan pengujian transaksi sandbox, bukan kanal pembayaran uang nyata." : "Situs ini menyediakan katalog produk Yubie. Situs tidak menerima pesanan atau pembayaran langsung."}</p>
    <h2>Informasi produk</h2><p>Ukuran dan harga yang ditampilkan adalah informasi katalog empat keluarga produk Yubie. Gambar konsep diberi keterangan; informasi label dan sertifikasi hanya diterbitkan setelah disetujui.</p>
    <h2>Kanal pembelian, pengiriman dan retur</h2><p>Tautan pembelian hanya ditampilkan untuk kanal yang disetujui. Harga akhir, stok, pembayaran, pengiriman dan retur mengikuti ketentuan toko pada kanal transaksi tersebut. Periksa ketentuannya sebelum membeli.</p>
    <h2>Pertanyaan</h2><p>Untuk informasi produk atau ketentuan pembelian, hubungi <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.</p>
  </main>;
}
