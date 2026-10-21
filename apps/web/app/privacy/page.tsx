import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return <main id="main" className="legal-page"><span className="eyebrow">PRIVACY</span><h1>Privacy Policy</h1>
    <h2>Penggunaan situs</h2><p>{directCommerce ? "Lingkungan sandbox menggunakan data uji untuk validasi akun dan transaksi. Jangan memasukkan data pelanggan nyata." : "Katalog ini tidak menyediakan akun pelanggan, formulir pendaftaran, atau checkout langsung."}</p>
    <h2>Kontak melalui email</h2><p>Jika Anda mengirim email, informasi yang Anda berikan digunakan untuk menangani pertanyaan tersebut. Kirim hanya informasi yang diperlukan untuk pertanyaan Anda.</p>
    <h2>Data teknis dan tautan eksternal</h2><p>Penyedia hosting dapat memproses data teknis permintaan untuk menyajikan dan mengamankan situs. Jika Anda membuka kanal eksternal, kebijakan privasi kanal tersebut berlaku.</p>
    <h2>Kontak</h2><p>Untuk pertanyaan privasi, hubungi <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.</p>
  </main>;
}
