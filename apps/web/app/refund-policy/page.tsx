import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";
import { legalPolicy, merchantIdentity, merchantIdentityComplete } from "@/config/merchant-identity";

export const metadata: Metadata = {
  title: "Kebijakan Pengembalian Dana dan Pembatalan Yubie",
  description:
    "Kebijakan resmi Yubie untuk pembatalan pesanan, retur, dan pengembalian dana: syarat, cara pengajuan, alur pemrosesan Finance, estimasi waktu, metode refund, dan penyelesaian sengketa.",
  alternates: { canonical: "/refund-policy" },
};

const sections = [
  { id: "lingkup", title: "1. Lingkup Kebijakan" },
  { id: "pembatalan", title: "2. Pembatalan Pesanan" },
  { id: "syarat-refund", title: "3. Kondisi yang Memenuhi Syarat Refund" },
  { id: "produk-pangan", title: "4. Pertimbangan Khusus Produk Pangan" },
  { id: "perlindungan-hukum", title: "5. Perlindungan Sesuai Peraturan" },
  { id: "cara-mengajukan", title: "6. Cara Mengajukan Komplain" },
  { id: "alur", title: "7. Alur Pemrosesan" },
  { id: "waktu", title: "8. Estimasi Waktu Pemrosesan" },
  { id: "metode", title: "9. Metode Pengembalian Dana" },
  { id: "biaya", title: "10. Biaya Pengiriman dan Administrasi" },
  { id: "sengketa", title: "11. Eskalasi dan Penyelesaian Sengketa" },
];

export default function RefundPolicyPage() {
  return (
    <main id="main" className="legal-page">
      <span className="eyebrow">REFUND</span>
      <h1>Kebijakan Pengembalian Dana dan Pembatalan Yubie</h1>
      <p className="legal-meta">
        Versi {legalPolicy.version} · Berlaku efektif sejak {legalPolicy.effectiveDate} (WIB). Dokumen ini merupakan bagian dari{" "}
        <Link href="/terms">Syarat &amp; Ketentuan Yubie</Link>.
      </p>
      <nav className="legal-toc" aria-label="Daftar isi Kebijakan Refund">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>

      <h2 id="lingkup">1. Lingkup Kebijakan</h2>
      <p>
        Kebijakan ini berlaku untuk transaksi yang dilakukan melalui situs resmi Yubie ({siteConfig.origin.replace("https://", "")}). Pembelian Yubie yang dilakukan melalui kanal marketplace (misalnya Shopee, Tokopedia, atau TikTok Shop) tunduk pada kebijakan pengembalian dana marketplace tempat transaksi tersebut dilakukan, dengan tetap menghormati hak-hak Anda menurut peraturan perundang-undangan; silakan gunakan fasilitas marketplace tersebut untuk pengajuan terkait transaksi di marketplace.
      </p>

      <h2 id="pembatalan">2. Pembatalan Pesanan</h2>
      {directCommerce ? (
        <p>
          Anda dapat meminta pembatalan pesanan <strong>sebelum pesanan diproses dan dikirim</strong> — sebaiknya sesegera mungkin setelah pembayaran, dengan menghubungi kami melalui email pada bagian 6. Pesanan yang sudah lunas dan belum diproses akan dibatalkan dan dana dikembalikan sesuai kebijakan ini. Pesanan yang belum dibayar kedaluwarsa otomatis dalam 24 jam tanpa tagihan. Setelah pesanan diserahkan kepada jasa kurir, pembatalan tidak dapat dijamin karena produk pangan bergerak cepat; kondisi tidak sesuai setelah barang diterima ditangani melalui proses komplain pada bagian 3.
        </p>
      ) : (
        <p>Pembatalan pesanan mengikuti kebijakan kanal resmi tempat transaksi dilakukan; untuk pembelian melalui situs ini saat checkout langsung belum tersedia, hubungi kami melalui email.</p>
      )}

      <h2 id="syarat-refund">3. Kondisi yang Memenuhi Syarat Refund</h2>
      <p>Pengajuan pengembalian dana dapat disetujui apabila terdapat salah satu kondisi terverifikasi berikut:</p>
      <ul>
        <li>produk yang diterima berbeda dari yang dipesan (salah produk atau salah varian);</li>
        <li>jumlah produk yang diterima kurang dari yang dibayar;</li>
        <li>produk rusak atau cacat pada saat diterima;</li>
        <li>produk kedaluwarsa (melewati tanggal kedaluwarsa pada kemasan) saat diterima;</li>
        <li>ketidaksesuaian pengiriman yang signifikan (misalnya pesanan tidak diterima padahal tercatat terkirim, atau dikirim ke alamat yang salah oleh kesalahan kami);</li>
        <li>terverifikasi adanya tagihan ganda atas transaksi yang sama;</li>
        <li>pesanan yang tidak kami penuhi (tidak dikirim) setelah pembayaran terverifikasi;</li>
        <li>kondisi lain yang diwajibkan dapat direfund oleh peraturan perundang-undangan.</li>
      </ul>
      <p>
        Verifikasi dilakukan oleh tim operasional kami berdasarkan nomor pesanan, bukti pengiriman, dan dokumentasi yang Anda kirimkan. Perubahan pendapat (change of mind) tanpa kondisi kelainan di atas bukan dasar refund untuk produk pangan — namun setiap pengajuan tetap kami tinjau secara wajar dan tidak otomatis ditolak.
      </p>

      <h2 id="produk-pangan">4. Pertimbangan Khusus Produk Pangan</h2>
      <p>
        Sebagian besar produk Yubie adalah pangan kemasan (tepung, shake, mie) dengan masa simpan tertentu, dan sebagian lainnya merupakan produk roti (Ppang) yang lebih sensitif terhadap waktu dan suhu. Prinsip penanganan komplain kami:
      </p>
      <ul>
        <li>
          <strong>Membuka kemasan untuk memeriksa produk tidak otomatis membatalkan hak komplain Anda.</strong> Anda tidak akan ditolak hanya karena kemasan telah dibuka untuk memeriksa kesesuaian atau kondisi produk.
        </li>
        <li>Untuk produk kedap/kering (tepung, shake, mie): periksa kondisi kemasan, segel, dan tanggal kedaluwarsa saat barang diterima; sampaikan komplain disertai foto segera setelah diterima.</li>
        <li>Untuk produk roti (Ppang): sampaikan komplain pada hari penerimaan disertai foto kondisi produk, mengingat sifat produk yang tidak tahan lama.</li>
        <li>Produk yang telah dikonsumsi sebagian besar isinya dapat memengaruhi penilaian — mohon simpan sisa produk dan kemasan sampai komplain selesai ditinjau.</li>
        <li>Keamanan pangan adalah prioritas kami: produk yang berubah tidak wajar (bau, warna, tekstur) sebaiknya tidak dikonsumsi dan segera dilaporkan kepada kami.</li>
      </ul>

      <h2 id="perlindungan-hukum">5. Perlindungan Sesuai Peraturan</h2>
      <p>
        Kebijakan ini disusun dengan menghormati hak Anda sebagai konsumen berdasarkan Undang-Undang Nomor 8 Tahun 1999 tentang Perlindungan Konsumen dan Peraturan Pemerintah Nomor 80 Tahun 2019 tentang Perdagangan Melalui Sistem Elektronik — termasuk kesempatan pembatalan transaksi yang memenuhi syarat paling lambat 2 (dua) hari kerja sejak barang diterima sebagaimana diatur Pasal 69 PP 80/2019 beserta pengecualiannya menurut peraturan tersebut. Hak tersebut berlaku untuk kondisi pembatalan/pengembalian yang diatur peraturan (misalnya barang tidak sesuai atau terdapat kelainan) dan bukan fasilitas pengembalian produk pangan tanpa alasan. Apabila terdapat perbedaan tafsir, perlindungan yang dijamin peraturan perundang-undangan yang berlaku tetap berlaku di atas ketentuan kebijakan ini.
      </p>

      <h2 id="cara-mengajukan">6. Cara Mengajukan Komplain</h2>
      <p>
        Kirim email ke <a href={`mailto:${merchantIdentity.refundEmail}`}>{merchantIdentity.refundEmail}</a> dengan subjek:{" "}
        <strong>{legalPolicy.refundComplaintSubject}</strong> (contoh: <em>{legalPolicy.refundComplaintSubject.replace("Nomor Pesanan", "YB-XXXXXX")}</em>), memuat:
      </p>
      <ul>
        <li>nomor referensi pesanan Anda;</li>
        <li>nama produk dan varian yang bersangkutan;</li>
        <li>uraian masalah (salah produk, rusak, kurang, kedaluwarsa, dan sebagainya);</li>
        <li>foto atau video kondisi produk/kemasan dan label kedaluwarsa bila relevan;</li>
        <li>informasi penerimaan (tanggal terima, kondisi paket);</li>
        <li>bukti pembayaran <strong>hanya bila diperlukan</strong> untuk menelusuri transaksi (misalnya tangkapan layar status transaksi).</li>
      </ul>
      <p>
        <strong>Penting:</strong> Yubie tidak pernah meminta PIN, OTP, password, atau data kartu lengkap Anda dalam penanganan komplain apa pun. Jangan mengirimkan informasi tersebut kepada siapa pun yang mengaku dari Yubie.
      </p>

      <h2 id="alur">7. Alur Pemrosesan</h2>
      <p>Pengajuan Anda diproses melalui alur resmi berikut:</p>
      <ol>
        <li>Penerimaan komplain oleh tim layanan pelanggan Yubie.</li>
        <li>Verifikasi oleh tim operasional (nomor pesanan, kondisi produk, bukti, catatan pengiriman).</li>
        <li>Peninjauan dan persetujuan oleh tim keuangan (Finance) dengan persetujuan berjenjang — satu pihak mengajukan, pihak lain menyetujui.</li>
        <li>Eksekusi pengembalian dana oleh Finance melalui dashboard merchant penyedia pembayaran.</li>
        <li>Konfirmasi independen atas penyelesaian refund pada sisi penyedia pembayaran.</li>
        <li>Pemberitahuan hasil kepada Anda melalui email.</li>
      </ol>
      <p>
        Pengembalian dana saat ini dieksekusi secara manual oleh tim keuangan kami — bukan tindakan otomatis dari situs web — demi keamanan transaksi. Selama proses refund berlangsung, pemenuhan pesanan terkait ditahan dan pesanan Anda tetap tercatat.
      </p>

      <h2 id="waktu">8. Estimasi Waktu Pemrosesan</h2>
      <ul>
        <li>Respon awal atas komplain: {legalPolicy.refundTimelines.acknowledgement}.</li>
        <li>Verifikasi dan peninjauan: {legalPolicy.refundTimelines.investigation} sejak lengkapnya informasi yang kami butuhkan.</li>
        <li>Eksekusi refund yang telah disetujui: {legalPolicy.refundTimelines.approvedExecution}.</li>
        <li>Waktu dana diterima kembali: {legalPolicy.refundTimelines.settlement}.</li>
      </ul>
      <p>
        Estimasi tersebut adalah komitmen layanan kami untuk tahap yang berada dalam kendali Yubie; waktu pemrosesan bank atau penyedia pembayaran di luar kendali kami merupakan estimasi, bukan jaminan tanggal tertentu. Apabila terjadi keterlambatan, kami akan menginformasikan statusnya kepada Anda.
      </p>

      <h2 id="metode">9. Metode Pengembalian Dana</h2>
      <p>
        Pengembalian dana dilakukan melalui penyedia pembayaran resmi Yubie (iPaymu) ke metode pembayaran asal transaksi Anda, atau — bila metode asal tidak mendukung pengembalian — melalui transfer ke rekening atas nama pembeli yang sama dengan identitas pemesan, sesuai kemampuan yang tersedia pada dashboard merchant. Saat ini proses operasional kami mendukung pengembalian dana <strong>penuh (full refund)</strong> atas nilai transaksi yang disetujui; pengembalian parsial tidak didukung. Kami tidak meminta Anda mengirimkan data rekening melalui kanal yang tidak resmi.
      </p>

      <h2 id="biaya">10. Biaya Pengiriman dan Administrasi</h2>
      <ul>
        <li>Komplain yang terverifikasi karena kesalahan kami (salah kirim, produk rusak/kedaluwarsa, pesanan tidak terkirim): tidak dikenakan biaya administrasi; biaya pengiriman yang telah dibayarkan ikut dikembalikan bila ada.</li>
        <li>Kejadian dalam pengiriman yang menjadi tanggung jawab jasa kurir (paket hilang/rusak berat): kami tetap menyelesaikan penggantian/refund kepada Anda terlebih dahulu, dan klaim kepada kurir menjadi urusan internal kami.</li>
        <li>Kesalahan data dari pembeli (misalnya alamat salah setelah konfirmasi, penolakan penerimaan tanpa kelainan produk): dapat dikenakan biaya yang wajar sesuai biaya nyata yang timbul (misalnya ongkir kirim ulang) — tanpa potongan yang tidak wajar atau melanggar hukum, dan akan kami informasikan terlebih dahulu.</li>
        <li>Kami tidak menerapkan biaya administrasi pengembalian dana secara sepihak untuk komplain yang sah.</li>
      </ul>

      <h2 id="sengketa">11. Eskalasi dan Penyelesaian Sengketa</h2>
      <p>
        Apabila Anda tidak puas dengan hasil penanganan, Anda dapat meminta eskalasi peninjauan ulang kepada kami melalui email yang sama dengan menyebutkan nomor komplain. Anda juga berhak menempuh penyelesaian sengketa sesuai peraturan perundang-undangan, termasuk melalui Badan Penyelesaian Sengketa Konsumen (BPSK) atau pengadilan yang berwenang. Ketentuan selengkapnya mengenai sengketa tersedia pada <Link href="/terms">Syarat &amp; Ketentuan</Link> bagian 17.
      </p>

      <h2 id="kontak-refund">Kontak Resmi Refund</h2>
      <p>
        Email: <a href={`mailto:${merchantIdentity.refundEmail}`}>{merchantIdentity.refundEmail}</a> (subjek {legalPolicy.refundComplaintSubject}).
        {merchantIdentityComplete && merchantIdentity.supportPhone ? (
          <>
            {" "}
            Telepon: <a href={merchantIdentity.supportPhone.telUrl} data-merchant-field="phone">{merchantIdentity.supportPhone.value}</a>.
          </>
        ) : null}
        {merchantIdentityComplete && merchantIdentity.supportHours ? (
          <>
            {" "}
            Jam layanan: <span data-merchant-field="support-hours">{merchantIdentity.supportHours.value}</span> (WIB).
          </>
        ) : null}{" "}
        Alamat usaha: {merchantIdentityComplete && merchantIdentity.registeredAddress ? <span data-merchant-field="address">{merchantIdentity.registeredAddress.value}</span> : merchantIdentity.publicRegion}.
      </p>
      <p>
        Pengajuan refund hanya diproses melalui kanal resmi di atas. Kanal komunitas (misalnya grup WhatsApp) bukan kanal pengajuan refund — hati-hati terhadap pihak yang meminta pembayaran atau data pribadi Anda di luar kanal resmi Yubie. Lihat juga <Link href="/contact">Hubungi Yubie</Link> dan <Link href="/faq">FAQ</Link>.
      </p>
    </main>
  );
}
