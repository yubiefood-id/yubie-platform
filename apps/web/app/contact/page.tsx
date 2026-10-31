import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { merchantIdentity, merchantIdentityComplete } from "@/config/merchant-identity";

export const metadata: Metadata = {
  title: "Hubungi Yubie",
  description:
    "Hubungi tim Yubie: email resmi, telepon layanan pelanggan, alamat usaha terdaftar, jam layanan, media sosial resmi, serta panduan pertanyaan produk, pesanan, pembayaran, pengiriman, dan refund.",
  alternates: { canonical: "/contact" },
};

const helpCategories = [
  { title: "Pertanyaan produk", description: "Varian, harga, informasi label, dan ketersediaan stok.", href: "/faq#produk" },
  { title: "Bantuan pesanan", description: "Cara memesan, data pesanan, dan konfirmasi pesanan.", href: "/faq#pemesanan" },
  { title: "Bantuan pembayaran", description: "Metode pembayaran iPaymu, status pembayaran, dan keamanan transaksi.", href: "/faq#pembayaran" },
  { title: "Status pengiriman", description: "Area layanan, ongkir, estimasi waktu, dan resi pengiriman.", href: "/faq#pengiriman" },
  { title: "Retur dan refund", description: "Syarat refund, cara pengajuan, dan estimasi waktu proses.", href: "/refund-policy" },
  { title: "Kemitraan bisnis", description: "Kebutuhan bisnis, sampling, volume besar, dan kolaborasi produk.", href: "/b2b" },
];

export default function ContactPage() {
  const identityReady = merchantIdentityComplete;
  return (
    <main id="main" className="contact-page">
      <header className="contact-hero">
        <span className="eyebrow">CUSTOMER CARE</span>
        <h1>
          Hubungi <em>Yubie</em>
        </h1>
        <p>
          Punya pertanyaan tentang produk Yubie, pesanan, pengiriman, atau pengembalian dana? Tim Yubie siap membantu melalui kanal kontak resmi kami.
        </p>
      </header>

      <section className="contact-cards" aria-label="Kanal kontak resmi">
        <article className="contact-card">
          <span className="contact-card-label">Email</span>
          <a className="contact-card-value" href={`mailto:${siteConfig.email}`}>
            {siteConfig.email}
          </a>
          <p>Untuk semua pertanyaan, komplain, dan pengajuan refund. Respons pada hari kerja.</p>
        </article>
        {identityReady && merchantIdentity.supportPhone ? (
          <article className="contact-card">
            <span className="contact-card-label">Telepon Layanan Pelanggan</span>
            <a className="contact-card-value" href={merchantIdentity.supportPhone.telUrl} data-merchant-field="phone">
              {merchantIdentity.supportPhone.value}
            </a>
            <p>
              Jam layanan: <span data-merchant-field="support-hours">{merchantIdentity.supportHours?.value}</span> (WIB).
            </p>
          </article>
        ) : null}
        {identityReady && merchantIdentity.registeredAddress ? (
          <article className="contact-card">
            <span className="contact-card-label">Alamat Usaha Terdaftar</span>
            <span className="contact-card-value" data-merchant-field="address">
              {merchantIdentity.registeredAddress.value}
            </span>
            <p>Sesuai alamat terdaftar pada profil merchant resmi Yubie.</p>
          </article>
        ) : null}
        <article className="contact-card">
          <span className="contact-card-label">Wilayah Usaha</span>
          <span className="contact-card-value">{merchantIdentity.publicRegion}</span>
          <p>Website resmi: {siteConfig.origin.replace("https://", "")}</p>
        </article>
        <article className="contact-card">
          <span className="contact-card-label">Media Sosial Resmi</span>
          <span className="contact-card-value">
            <a href={siteConfig.social.instagram} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            {" · "}
            <a href={siteConfig.social.tiktok} target="_blank" rel="noopener noreferrer">
              TikTok
            </a>
          </span>
          <p>Akun resmi Yubie untuk kabar produk dan komunitas.</p>
        </article>
      </section>

      <section className="contact-help" aria-labelledby="contact-help-title">
        <h2 id="contact-help-title">Apa yang bisa kami bantu?</h2>
        <div className="contact-help-grid">
          {helpCategories.map((category) => (
            <Link key={category.title} className="contact-help-card" href={category.href}>
              <strong>{category.title} <span aria-hidden="true">→</span></strong>
              <span>{category.description}</span>
            </Link>
          ))}
        </div>
      </section>

      {identityReady && merchantIdentity.legalOperatorName && merchantIdentity.entityType ? (
        <section className="contact-identity" aria-labelledby="contact-identity-title">
          <h2 id="contact-identity-title">Identitas Badan Usaha</h2>
          <p>
            <span data-merchant-field="legal-name">{merchantIdentity.legalOperatorName.value}</span> —{" "}
            <span data-merchant-field="entity-type">{merchantIdentity.entityType.value}</span>
            {merchantIdentity.registeredAddress ? (
              <>
                {" "}
                · <span data-merchant-field="address">{merchantIdentity.registeredAddress.value}</span>
              </>
            ) : null}
            .
          </p>
          <p>
            Identitas di atas adalah badan usaha resmi pengelola merek Yubie dan terdaftar pada profil merchant resmi Yubie di penyedia pembayaran.
          </p>
        </section>
      ) : null}

      <section className="contact-shortcuts" aria-labelledby="contact-shortcuts-title">
        <h2 id="contact-shortcuts-title">Tautan Bantuan Lainnya</h2>
        <ul>
          <li>
            <Link href="/faq">FAQ — Pertanyaan yang Sering Diajukan</Link>
          </li>
          <li>
            <Link href="/terms">Syarat &amp; Ketentuan Yubie</Link>
          </li>
          <li>
            <Link href="/refund-policy">Kebijakan Pengembalian Dana dan Pembatalan</Link>
          </li>
          <li>
            <Link href="/privacy">Kebijakan Privasi</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
