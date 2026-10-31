import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";
import { legalPolicy, merchantIdentity, merchantIdentityComplete } from "@/config/merchant-identity";

export const metadata: Metadata = {
  title: "FAQ — Pertanyaan yang Sering Diajukan",
  description:
    "Pertanyaan yang sering diajukan tentang produk Yubie, cara memesan, pembayaran iPaymu, pengiriman, refund, privasi, dan cara menghubungi tim Yubie.",
  alternates: { canonical: "/faq" },
};

interface FaqItem {
  q: string;
  a: ReactNode;
}

const faqCategories: { id: string; title: string; items: FaqItem[] }[] = [
  {
    id: "tentang-yubie",
    title: "Tentang Yubie",
    items: [
      {
        q: "Apa itu Yubie?",
        a: "Yubie adalah merek pangan Indonesia yang mengembangkan produk kontemporer berbahan dasar ubi lokal — dari tepung sampai siap santap. Semua produk Yubie dikembangkan dari eksplorasi ubi Indonesia.",
      },
      {
        q: "Produk apa saja yang tersedia?",
        a: "Katalog Yubie terdiri dari empat keluarga produk: Yubie Flour (tepung ubi), Yubie Shake (minuman bubuk kemasan), Yubie Ppang (roti/camilan), dan Yubie Mie — total sembilan pilihan ukuran atau pack dengan harga dalam Rupiah yang tertera pada halaman setiap produk.",
      },
      {
        q: "Apakah produk Yubie sudah bersertifikat, misalnya halal atau BPOM?",
        a: "Informasi sertifikasi hanya diterbitkan setelah proses verifikasi final untuk produk yang tepat. Situs ini sengaja tidak menampilkan klaim sertifikasi, gizi, atau kesehatan yang belum disetujui — kami hanya menampilkan informasi yang sudah terverifikasi.",
      },
      {
        q: "Di mana Yubie beroperasi?",
        a: (
          <>
            Yubie adalah merek pangan Indonesia yang berbasis di {merchantIdentity.publicRegion}. Untuk pengiriman pesanan daring, saat ini kami melayani area yang telah disetujui — lihat kategori <Link href="#pengiriman">Pengiriman</Link> di halaman ini.
          </>
        ),
      },
    ],
  },
  {
    id: "produk",
    title: "Produk",
    items: [
      {
        q: "Bagaimana cara melihat informasi dan harga produk?",
        a: (
          <>
            Buka halaman <Link href="/products">Produk</Link>, pilih produk yang ingin dilihat. Setiap halaman produk menampilkan varian ukuran/pack, harga dalam Rupiah, dan ketersediaannya. Harga final dan ketersediaan selalu dikonfirmasi ulang oleh sistem saat Anda checkout.
          </>
        ),
      },
      {
        q: "Apakah produk Yubie memiliki klaim kesehatan atau gizi tertentu?",
        a: "Tidak ada klaim gizi, kesehatan, atau terapi yang ditampilkan sebelum diverifikasi dan disetujui. Informasi komposisi dan label lengkap diterbitkan per produk setelah verifikasi final. Jika Anda memiliki alergi atau kebutuhan diet khusus, hubungi kami sebelum membeli.",
      },
      {
        q: "Bagaimana cara menyimpan produk Yubie?",
        a: "Simpan setiap produk sesuai keterangan pada kemasan. Pedoman penyimpanan dan masa simpan spesifik per produk diterbitkan bersama informasi label setelah verifikasi final. Bila ragu, hubungi kami dengan menyebutkan produk dan nomor pesanan Anda.",
      },
      {
        q: "Apakah Yubie melayani kebutuhan bisnis seperti kafe, bakery, atau retail?",
        a: (
          <>
            Ya. Untuk kebutuhan bisnis (B2B) — sampling, volume besar, atau kolaborasi produk — silakan isi formulir di halaman <Link href="/b2b">B2B</Link> dan tim kami akan menghubungi Anda.
          </>
        ),
      },
    ],
  },
  {
    id: "pemesanan",
    title: "Pemesanan",
    items: [
      {
        q: "Bagaimana cara memesan produk Yubie?",
        a: directCommerce ? (
          <>
            Pesanan langsung di situs ini: pilih produk, tentukan varian dan jumlah, masukkan ke keranjang, lalu buka halaman checkout. Isi data kontak dan pengiriman Anda, pastikan kota Anda termasuk area layanan, periksa total yang terverifikasi, lalu lanjutkan ke pembayaran. Anda juga dapat memesan melalui kanal resmi lain yang ditautkan pada halaman produk.
          </>
        ) : (
          <>
            Pembelian dapat dilakukan melalui kanal resmi yang ditautkan pada halaman setiap produk. Harga, stok, pembayaran, dan pengiriman mengikuti ketentuan kanal tempat Anda bertransaksi.
          </>
        ),
      },
      {
        q: "Apakah saya harus membuat akun untuk memesan?",
        a: directCommerce ? (
          <>
            Tidak wajib. Checkout tersedia untuk tamu (guest) — cukup alamat email dan nomor WhatsApp yang aktif. Masuk dengan akun Google bersifat opsional, berguna untuk menyimpan riwayat pesanan Anda.
          </>
        ) : (
          <>Saat ini situs ini tidak menyediakan checkout langsung; pembelian mengikuti kanal resmi pada halaman produk.</>
        ),
      },
      {
        q: "Bagaimana saya tahu pesanan saya sudah diterima dan diproses?",
        a: directCommerce ? (
          <>
            Setelah pembayaran Anda terverifikasi oleh sistem kami (bukan hanya halaman kembali dari penyedia pembayaran), status pesanan dapat dipantau melalui halaman konfirmasi pesanan dengan nomor referensi pesanan Anda. Pesanan yang sudah dibayar kemudian dikemas dan dikirim dengan nomor resi bila tersedia.
          </>
        ) : (
          <>Konfirmasi pesanan mengikuti kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Ada batas jumlah atau nilai pesanan?",
        a: directCommerce ? (
          <>
            Ada. Maksimal 20 unit per jenis produk per baris pesanan, dan total pesanan langsung maksimal Rp10.000.000. Untuk kebutuhan yang lebih besar, silakan hubungi kami melalui halaman <Link href="/b2b">B2B</Link>.
          </>
        ) : (
          <>Batas pembelian mengikuti ketentuan kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Bagaimana jika saya salah memasukkan data pesanan atau alamat?",
        a: (
          <>
            Segera hubungi kami melalui <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> dengan nomor pesanan Anda sebelum pesanan dikirim. Setelah pesanan dikirim, perubahan alamat tidak selalu dapat dilakukan. Ketentuan pembatalan selengkapnya ada di <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: "pembayaran",
    title: "Pembayaran",
    items: [
      {
        q: "Metode pembayaran apa saja yang tersedia?",
        a: directCommerce ? (
          <>
            Pembayaran checkout langsung di situs ini diproses melalui iPaymu, penyedia pembayaran resmi Yubie. Metode yang tampil (misalnya virtual account bank atau dompet digital) bergantung pada konfigurasi yang aktif di halaman pembayaran iPaymu saat transaksi. Semua pembayaran dalam Rupiah.
          </>
        ) : (
          <>Pembayaran mengikuti metode yang tersedia pada kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Apakah pembayaran saya aman?",
        a: directCommerce ? (
          <>
            Ya. Anda akan diarahkan ke halaman pembayaran terpisah milik penyedia pembayaran (iPaymu). Yubie tidak pernah menyimpan data kartu, PIN, atau OTP Anda. Status pembayaran diverifikasi oleh server Yubie berdasarkan konfirmasi resmi dari penyedia pembayaran.
          </>
        ) : (
          <>Keamanan pembayaran mengikuti ketentuan kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Saya sudah kembali dari halaman pembayaran — apakah pesanan saya otomatis lunas?",
        a: directCommerce ? (
          <>
            Belum tentu. Halaman kembali dari penyedia pembayaran bukan bukti pembayaran berhasil. Pesanan Anda berstatus lunas hanya setelah server Yubie menerima konfirmasi terverifikasi dari penyedia pembayaran. Jika statusnya belum jelas, jangan melakukan pembayaran kedua — periksa status pesanan dari halaman yang sama atau hubungi kami.
          </>
        ) : (
          <>Status pembelian dapat dilihat pada kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Bagaimana jika pembayaran terputus di tengah proses atau statusnya tidak jelas?",
        a: directCommerce ? (
          <>
            Jangan membuat pesanan baru atau melakukan pembayaran kedua. Kembali ke halaman checkout/status pesanan — sistem akan melanjutkan percobaan yang sama dan memeriksa statusnya dari penyedia pembayaran. Pesanan yang belum dibayar kedaluwarsa otomatis dalam 24 jam. Bila status tetap tidak jelas, hubungi{" "}
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> dengan nomor pesanan Anda.
          </>
        ) : (
          <>Hubungi kanal resmi tempat Anda bertransaksi untuk status pembayaran.</>
        ),
      },
    ],
  },
  {
    id: "pengiriman",
    title: "Pengiriman",
    items: [
      {
        q: "Ke area mana saja Yubie mengirim pesanan?",
        a: directCommerce ? (
          <>
            Saat ini pengiriman pesanan langsung hanya tersedia untuk kota/kabupaten yang telah disetujui oleh tim operasional kami. Daftar area terbaru selalu ditampilkan pada halaman checkout — di luar daftar itu, pengiriman belum dapat dilayani untuk sementara. Kami sedang memperluas area layanan secara bertahap.
          </>
        ) : (
          <>Pengiriman mengikuti ketentuan kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Berapa biaya pengiriman (ongkir)?",
        a: directCommerce ? (
          <>
            Saat ini kami menjalankan program pengiriman gratis (Rp0) untuk area layanan yang disetujui. Program ini bersifat promosi berkala yang disetujui tim kami — bukan janji gratis ongkir permanen atau nasional. Biaya pengiriman yang berlaku untuk pesanan Anda selalu ditampilkan dan diverifikasi di halaman checkout sebelum Anda membayar.
          </>
        ) : (
          <>Ongkir mengikuti ketentuan kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Berapa lama pesanan diproses dan dikirim?",
        a: directCommerce ? (
          <>
            Pesanan yang sudah terverifikasi pembayarannya dikemas oleh tim kami, lalu dikirim ke alamat Anda. Lamanya dipengaruhi stok, hari kerja/libur, dan jarak lokasi. Nomor resi pengiriman dikomunikasikan setelah pesanan diserahkan ke kurir, bila tersedia.
          </>
        ) : (
          <>Waktu pengiriman mengikuti ketentuan kanal resmi tempat Anda bertransaksi.</>
        ),
      },
      {
        q: "Bagaimana jika paket saya terlambat, rusak, atau tidak sesuai pesanan?",
        a: (
          <>
            Segera hubungi kami melalui <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> dengan nomor pesanan, foto kondisi paket/produk, dan keterangan masalahnya. Ketentuan penggantian dan pengembalian dana selengkapnya ada di{" "}
            <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: "retur-refund",
    title: "Retur & Refund",
    items: [
      {
        q: "Dalam kondisi apa saya bisa mengajukan pengembalian dana?",
        a: (
          <>
            Contoh kondisi yang dapat diajukan: produk salah atau tidak sesuai pesanan, jumlah kurang, produk rusak atau cacat, produk kedaluwarsa, ketidaksesuaian pengiriman yang signifikan, tagihan ganda yang terverifikasi, atau pesanan yang tidak dikirim. Rincian lengkap ada di{" "}
            <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>.
          </>
        ),
      },
      {
        q: "Bagaimana cara mengajukan komplain atau refund?",
        a: (
          <>
            Kirim email ke <a href={`mailto:${merchantIdentity.refundEmail}`}>{merchantIdentity.refundEmail}</a> dengan subjek{" "}
            <strong>{legalPolicy.refundComplaintSubject}</strong>, isi nomor pesanan, produk, deskripsi masalah, dan foto/bukti pendukung. Tim kami akan memverifikasi, meninjau, dan memproses sesuai kebijakan.
          </>
        ),
      },
      {
        q: "Berapa lama refund diproses?",
        a: (
          <>
            Respon awal {legalPolicy.refundTimelines.acknowledgement}; verifikasi dan peninjauan {legalPolicy.refundTimelines.investigation}; setelah disetujui, eksekusi refund {legalPolicy.refundTimelines.approvedExecution}; waktu dana sampai ke Anda {legalPolicy.refundTimelines.settlement}. Rincian alurnya di{" "}
            <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: "privasi-keamanan",
    title: "Privasi & Keamanan",
    items: [
      {
        q: "Data apa saja yang Yubie kumpulkan?",
        a: (
          <>
            Data yang kami proses antara lain: identitas kontak (nama, email, nomor WhatsApp), alamat pengiriman, isi keranjang dan pesanan, lokasi hanya bila Anda mengizinkan deteksi lokasi, data akun bila Anda masuk dengan Google, serta data teknis untuk keamanan situs. Rincian tujuan dan dasar pemrosesan ada di{" "}
            <Link href="/privacy">Kebijakan Privasi</Link>.
          </>
        ),
      },
      {
        q: "Apakah data saya dibagikan ke pihak lain?",
        a: (
          <>
            Kami tidak menjual data pribadi Anda. Data hanya dibagikan sebatas yang diperlukan kepada penyedia layanan yang sah — misalnya penyedia pembayaran (email dan nomor telepon untuk pembuatan tagihan), jasa kurir untuk pengiriman, dan penyedia infrastruktur situs. Rincian ada di{" "}
            <Link href="/privacy">Kebijakan Privasi</Link>.
          </>
        ),
      },
      {
        q: "Bagaimana saya bisa menggunakan hak atas data pribadi saya?",
        a: (
          <>
            Anda dapat menghubungi <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> untuk pertanyaan, permintaan akses, koreksi, atau penghapusan data pribadi sesuai peraturan perlindungan data pribadi yang berlaku. Prosedur selengkapnya di{" "}
            <Link href="/privacy">Kebijakan Privasi</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: "bantuan-kontak",
    title: "Bantuan & Kontak",
    items: [
      {
        q: "Bagaimana cara menghubungi tim Yubie?",
        a: (
          <>
            Kanal resmi layanan pelanggan Yubie: email <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> dan situs{" "}
            <a href={siteConfig.origin}>{siteConfig.origin.replace("https://", "")}</a>. Seluruh kanal resmi kami juga tercantum di halaman{" "}
            <Link href="/contact">Hubungi Yubie</Link>.
            {merchantIdentityComplete && merchantIdentity.supportPhone ? (
              <>
                {" "}
                Telepon layanan pelanggan:{" "}
                <a href={merchantIdentity.supportPhone.telUrl}>{merchantIdentity.supportPhone.value}</a>.
              </>
            ) : null}
          </>
        ),
      },
      {
        q: merchantIdentityComplete && merchantIdentity.supportHours ? `Kapan layanan pelanggan aktif? (${merchantIdentity.supportHours.value})` : "Kapan layanan pelanggan aktif?",
        a: merchantIdentityComplete && merchantIdentity.supportHours ? (
          <>
            Layanan pelanggan kami aktif pada jam {merchantIdentity.supportHours.value} (WIB). Pengajuan di luar jam layanan akan ditangani pada jam layanan berikutnya.
          </>
        ) : (
          <>
            Pengajuan melalui email ditangani pada hari kerja. Kanal dan jam layanan resmi tercantum di halaman <Link href="/contact">Hubungi Yubie</Link>.
          </>
        ),
      },
      {
        q: "Apakah ada WhatsApp resmi untuk komplain atau refund?",
        a: (
          <>
            Pengajuan resmi keluhan, pembatalan, dan pengembalian dana kami layani melalui email <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> agar terdokumentasi dan dapat ditinjau tim terkait. Grup komunitas WhatsApp Yubie merupakan kanal komunitas, bukan kanal resmi layanan keluhan atau refund.
          </>
        ),
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <main id="main" className="faq-page">
      <header>
        <span className="eyebrow">CARE &amp; CLARITY</span>
        <h1>
          Good questions,
          <br />
          <em>clear answers.</em>
        </h1>
        <p className="faq-intro">
          Semua yang perlu Anda ketahui tentang produk Yubie, pemesanan, pembayaran, pengiriman, dan pengembalian dana. Tidak menemukan jawabannya? Email kami di{" "}
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> atau buka halaman <Link href="/contact">Hubungi Yubie</Link>.
        </p>
      </header>
      <nav className="faq-nav" aria-label="Kategori pertanyaan">
        {faqCategories.map((category) => (
          <a key={category.id} href={`#${category.id}`}>
            {category.title}
          </a>
        ))}
      </nav>
      {faqCategories.map((category) => (
        <section key={category.id} aria-labelledby={`faq-${category.id}`}>
          <h2 id={`faq-${category.id}`}>{category.title}</h2>
          {category.items.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <span>＋</span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      ))}
    </main>
  );
}
