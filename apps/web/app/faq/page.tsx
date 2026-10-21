import type { Metadata } from "next";
const faqs = [
  ["Apa itu Yubie?", "Yubie adalah startup pangan Indonesia yang mengembangkan produk kontemporer berbahan ubi lokal."],
  ["Produk apa yang ada di katalog?", "Katalog mencakup Yubie Flour, Shake, Ppang, dan Mie dalam sembilan pilihan ukuran atau pack. Harga dan ketersediaan transaksi dikonfirmasi melalui kanal resmi; checkout langsung belum tersedia di situs ini."],
  ["Apakah produk sudah tersertifikasi?", "Informasi sertifikasi akan dipublikasikan setelah final verification. Situs ini tidak menampilkan sertifikasi yang belum disetujui."],
  ["Bagaimana untuk kebutuhan bisnis?", "Silakan gunakan halaman B2B untuk memulai diskusi kebutuhan, sampling, dan aplikasi produk."],
];
export const metadata: Metadata = { title: "FAQ", alternates: { canonical: "/faq" } };

export default function FAQPage() { return <main id="main" className="faq-page"><header><span className="eyebrow">CARE & CLARITY</span><h1>Good questions,<br /><em>clear answers.</em></h1></header><section>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>＋</span></summary><p>{answer}</p></details>)}</section></main>; }
