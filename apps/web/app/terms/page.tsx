import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";
import { legalPolicy, merchantIdentity, merchantIdentityComplete } from "@/config/merchant-identity";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan Yubie",
  description:
    "Syarat & Ketentuan penggunaan situs dan pembelian produk Yubie: identitas pengelola, pemesanan, pembayaran iPaymu, pengiriman, pembatalan, refund, privasi, dan penyelesaian sengketa.",
  alternates: { canonical: "/terms" },
};

const sections = [
  { id: "pendahuluan", title: "1. Pendahuluan dan Ketentuan Umum" },
  { id: "identitas-pengelola", title: "2. Identitas Pengelola Website" },
  { id: "lingkup-produk", title: "3. Ruang Lingkup Produk" },
  { id: "penggunaan-website", title: "4. Penggunaan Website dan Akun" },
  { id: "informasi-produk", title: "5. Informasi Produk dan Ketersediaan" },
  { id: "harga", title: "6. Harga, Pajak, Promo, dan Diskon" },
  { id: "pemesanan", title: "7. Pemesanan dan Konfirmasi Pesanan" },
  { id: "pembayaran", title: "8. Metode Pembayaran" },
  { id: "pengiriman", title: "9. Pengiriman, Ongkir, dan Area Layanan" },
  { id: "pembatalan", title: "10. Pembatalan, Retur, dan Refund" },
  { id: "perlindungan-konsumen", title: "11. Perlindungan Konsumen dan Keamanan Produk" },
  { id: "data-pribadi", title: "12. Data Pribadi dan Privasi" },
  { id: "hki", title: "13. Hak Kekayaan Intelektual" },
  { id: "batasan-tanggung-jawab", title: "14. Batasan Tanggung Jawab" },
  { id: "keadaan-kahar", title: "15. Keadaan Kahar (Force Majeure)" },
  { id: "perubahan-ketentuan", title: "16. Perubahan Ketentuan" },
  { id: "sengketa", title: "17. Keluhan dan Penyelesaian Sengketa" },
  { id: "kontak-resmi", title: "18. Informasi Kontak Resmi" },
];

const OperatorIdentity = () => (
  <>
    {merchantIdentityComplete && merchantIdentity.legalOperatorName && merchantIdentity.entityType ? (
      <p>
        <span data-merchant-field="legal-name">{merchantIdentity.legalOperatorName.value}</span> (
        <span data-merchant-field="entity-type">{merchantIdentity.entityType.value}</span>), selaku pengelola dan pemilik merek Yubie, mengoperasikan situs{" "}
        <a href={siteConfig.origin}>{siteConfig.origin.replace("https://", "")}</a> (&quot;Situs&quot;).
      </p>
    ) : null}
    <p>
      Wilayah usaha: {merchantIdentity.publicRegion}. Surel resmi:{" "}
      <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
      {merchantIdentityComplete && merchantIdentity.registeredAddress ? (
        <>
          {" "}
          Alamat usaha terdaftar: <span data-merchant-field="address">{merchantIdentity.registeredAddress.value}</span>.
        </>
      ) : null}
      {merchantIdentityComplete && merchantIdentity.supportPhone ? (
        <>
          {" "}
          Telepon layanan pelanggan:{" "}
          <a href={merchantIdentity.supportPhone.telUrl} data-merchant-field="phone">
            {merchantIdentity.supportPhone.value}
          </a>
          .
        </>
      ) : null}
    </p>
  </>
);

export default function TermsPage() {
  return (
    <main id="main" className="legal-page">
      <span className="eyebrow">TERMS</span>
      <h1>Syarat &amp; Ketentuan Yubie</h1>
      <p className="legal-meta">
        Versi {legalPolicy.version} · Berlaku efektif sejak {legalPolicy.effectiveDate} (WIB). Versi terbaru selalu tersedia di halaman ini.
      </p>
      <nav className="legal-toc" aria-label="Daftar isi Syarat & Ketentuan">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>

      <h2 id="pendahuluan">1. Pendahuluan dan Ketentuan Umum</h2>
      <p>
        Selamat datang di Yubie. Syarat &amp; Ketentuan ini (&quot;Ketentuan&quot;) mengatur penggunaan Situs serta kegiatan transaksi produk Yubie melalui kanal resmi yang tersedia di Situs. Dengan mengakses, menggunakan Situs, dan/atau melakukan pemesanan, Anda dianggap telah membaca, memahami, dan menyetujui seluruh Ketentuan yang berlaku, termasuk <Link href="/privacy">Kebijakan Privasi</Link> dan <Link href="/refund-policy">Kebijakan Pengembalian Dana dan Pembatalan</Link> yang merupakan bagian tidak terpisahkan dari Ketentuan ini.
      </p>
      <p>
        Apabila Anda tidak menyetujui sebagian atau seluruh Ketentuan ini, mohon untuk tidak menggunakan Situs. Ketentuan ini berlaku untuk seluruh pengunjung dan pelanggan, termasuk pelanggan perorangan (konsumen) dan pelanggan bisnis.
      </p>

      <h2 id="identitas-pengelola">2. Identitas Pengelola Website</h2>
      <OperatorIdentity />
      <p>
        Yubie adalah merek pangan modern berbahan dasar ubi Indonesia. Informasi identitas di atas merupakan data resmi yang digunakan pada profil merchant Yubie di penyedia pembayaran.
      </p>

      <h2 id="lingkup-produk">3. Ruang Lingkup Produk</h2>
      <p>
        Produk yang dipasarkan melalui Situs adalah produk pangan keluarga Yubie, saat ini meliputi empat keluarga produk: Yubie Flour (tepung berbahan ubi), Yubie Shake (minuman bubuk kemasan), Yubie Ppang (roti/camilan), dan Yubie Mie — dalam varian ukuran/pack yang tertera pada halaman masing-masing produk. Tersedia pula penjualan bagi kebutuhan bisnis (B2B) melalui halaman khusus.
      </p>
      <p>
        Ketersediaan setiap produk bersifat dinamis mengikuti stok dan keputusan operasional. Situs tidak menjual produk di luar keluarga produk resmi Yubie dan tidak melayani permintaan yang bertentangan dengan peraturan perundang-undangan.
      </p>

      <h2 id="penggunaan-website">4. Penggunaan Website dan Akun</h2>
      <p>Anda setuju untuk menggunakan Situs hanya untuk tujuan yang sah, sesuai peraturan perundang-undangan, dan tidak untuk:</p>
      <ul>
        <li>melakukan tindakan yang menyalahi hukum, termasuk penipuan, pencucian uang, atau aktivitas ilegal lainnya;</li>
        <li>mengganggu, merusak, atau mencoba mengakses sistem Situs secara tidak sah;</li>
        <li>menyalin atau menyalahgunakan konten Situs untuk tujuan komersial tanpa izin tertulis;</li>
        <li>memasukkan informasi palsu, menyesatkan, atau data pihak lain tanpa izin.</li>
      </ul>
      {directCommerce ? (
        <p>
          Untuk kenyamanan Anda, Situs menyediakan opsional masuk akun menggunakan Google. Anda bertanggung jawab menjaga keamanan akses akun Anda dan segera melaporkan penggunaan yang tidak sah. Checkout juga tersedia tanpa akun (sebagai tamu).
        </p>
      ) : (
        <p>Situs ini saat ini menampilkan katalog informasi produk; pembelian dilakukan melalui kanal resmi yang ditautkan pada halaman produk.</p>
      )}

      <h2 id="informasi-produk">5. Informasi Produk dan Ketersediaan</h2>
      <p>
        Kami berupaya menampilkan informasi produk secara akurat. Gambar ilustrasi dapat berbeda dari kondisi aktual. Klaim gizi, kesehatan, sertifikasi (termasuk halal dan BPOM), informasi alergen, serta masa simpan hanya ditampilkan setelah melalui proses verifikasi internal dan persetujuan resmi untuk produk yang bersangkutan — Situs tidak menampilkan klaim yang belum terverifikasi.
      </p>
      <p>
        Ketersediaan produk dapat berubah sewaktu-waktu. Ketersediaan akhir untuk pesanan langsung dikonfirmasi oleh sistem pada saat proses checkout berdasarkan stok yang terverifikasi.
      </p>

      <h2 id="harga">6. Harga, Pajak, Promo, dan Diskon</h2>
      <p>
        Seluruh harga produk ditampilkan dalam Mata Uang Rupiah (IDR). Harga yang berlaku untuk pesanan Anda adalah harga yang tertera dan diverifikasi pada saat checkout, sebelum pembayaran dibuat. Untuk pesanan langsung di Situs, berlaku batas maksimal 20 unit per baris produk dan total pesanan maksimal Rp10.000.000; kebutuhan yang lebih besar dilayani melalui kanal B2B.
      </p>
      <p>
        Promo, kode diskon, dan program gratis ongkir bersifat terbatas waktu, dapat berubah atau dihentikan sesuai ketentuan program yang berlaku, dan divalidasi oleh sistem pada saat checkout. Apabila harga sudah mencakup atau belum mencakup pajak tertentu, keterangan tersebut ditampilkan pada rincian pesanan. Kami tidak menambahkan biaya tersembunyi di luar rincian yang ditampilkan sebelum pembayaran.
      </p>

      <h2 id="pemesanan">7. Pemesanan dan Konfirmasi Pesanan</h2>
      {directCommerce ? (
        <p>
          Pemesanan langsung di Situs dilakukan melalui proses berikut: memilih produk dan varian, menentukan jumlah, melanjutkan ke checkout, mengisi data kontak dan pengiriman, memastikan area pengiriman terlayani, meninjau total yang diverifikasi sistem, lalu menyelesaikan pembayaran. Setelah permintaan checkout dibuat, sistem memesan stok untuk pesanan Anda dalam batas waktu tertentu (pesanan yang belum dibayar kedaluwarsa otomatis dalam 24 jam).
        </p>
      ) : (
        <p>Pemesanan dilakukan melalui kanal resmi yang ditautkan pada halaman produk, dengan proses pemesanan mengikuti ketentuan kanal tersebut.</p>
      )}
      <p>
        {directCommerce
          ? "Total pembayaran yang sahih untuk pesanan Anda adalah total yang dihitung dan diverifikasi oleh sistem Yubie — bukan oleh peramban/perangkat Anda. Kami berhak menolak atau membatalkan pesanan apabila terdindikasi kesalahan harga, indisponibilitas stok, aktivitas mencurigakan, atau apabila verifikasi pembayaran tidak berhasil; dalam hal tersebut dana yang telah dibayarkan akan dikembalikan sesuai Kebijakan Pengembalian Dana."
          : "Harga akhir, stok, dan konfirmasi pesanan mengikuti ketentuan kanal resmi tempat transaksi dilakukan."}
      </p>

      <h2 id="pembayaran">8. Metode Pembayaran</h2>
      {directCommerce ? (
        <>
          <p>
            Pembayaran pesanan langsung di Situs diproses melalui iPaymu, penyedia jasa pembayaran yang bekerja sama dengan Yubie. Anda akan diarahkan ke halaman pembayaran terpisah milik penyedia pembayaran untuk menyelesaikan transaksi. Metode pembayaran yang tersedia (misalnya virtual account bank atau dompet digital) bergantung pada konfigurasi yang aktif pada halaman pembayaran saat transaksi dan seluruhnya dalam Rupiah.
          </p>
          <p>
            Keterlibatan penyedia pembayaran pihak ketiga tidak mengalihkan tanggung jawab Yubie sebagai penjual atas keberhasilan transaksi dan pemenuhan pesanan Anda. Halaman kembali dari penyedia pembayaran (termasuk halaman &quot;sukses&quot; pada peramban) bukan bukti pembayaran berhasil; status pembayaran yang sahih ditetapkan oleh sistem Yubie berdasarkan konfirmasi resmi dari penyedia pembayaran. Apabila status pembayaran tidak jelas, jangan melakukan pembayaran kedua — gunakan halaman status pesanan atau hubungi kami.
          </p>
        </>
      ) : (
        <p>Metode pembayaran mengikuti yang tersedia pada kanal resmi tempat Anda bertransaksi.</p>
      )}

      <h2 id="pengiriman">9. Pengiriman, Ongkir, dan Area Layanan</h2>
      {directCommerce ? (
        <>
          <p>
            Pengiriman pesanan langsung saat ini hanya tersedia untuk kota/kabupaten dalam area layanan yang disetujui tim operasional kami. Daftar area terbaru selalu ditampilkan pada halaman checkout. Di luar area tersebut, layanan pengiriman belum tersedia untuk sementara dan sistem akan menolaknya sebelum pembayaran — kami sedang memperluas jangkauan secara bertahap.
          </p>
          <p>
            Saat ini berlaku program pengiriman gratis (ongkir Rp0) untuk area layanan yang disetujui. Program ini bersifat promosi berkala yang disetujui tim kami dan bukan janji gratis ongkir permanen maupun nasional; biaya pengiriman yang berlaku selalu diverifikasi dan ditampilkan pada checkout sebelum Anda membayar. Estimasi waktu pengiriman dipengaruhi stok, hari kerja/libur, dan lokasi; nomor resi dikomunikasikan setelah pesanan diserahkan ke kurir, bila tersedia. Risiko kehilangan atau kerusakan paket setelah serah terima kepada kurir ditangani bersama jasa kurir sesuai prosedur komplain kami — Anda tetap berhak mengajukan komplain kepada Yubie.
          </p>
        </>
      ) : (
        <p>Pengiriman mengikuti ketentuan kanal resmi tempat Anda bertransaksi.</p>
      )}

      <h2 id="pembatalan">10. Pembatalan, Retur, dan Refund</h2>
      <p>
        Pembatalan sebelum pesanan diproses/dikirim dapat diajukan sesuai prosedur pada <Link href="/refund-policy">Kebijakan Pengembalian Dana dan Pembatalan</Link>. Untuk produk pangan, retur tidak dimaksudkan sebagai fasilitas &quot;pencobaan barang&quot; — namun Anda tetap dilindungi hukum untuk kondisi produk yang tidak sesuai, rusak, cacat, kedaluwarsa, salah kirim, tagihan ganda, atau pesanan tidak terkirim. Proses pengembalian dana dilakukan oleh tim keuangan kami melalui penyedia pembayaran dengan tinjauan dan persetujuan berjenjang. Rincian selengkapnya mengikuti kebijakan tersebut.
      </p>

      <h2 id="perlindungan-konsumen">11. Perlindungan Konsumen dan Keamanan Produk</h2>
      <p>
        Kami berkomitmen memenuhi ketentuan perlindungan konsumen yang berlaku di Indonesia, termasuk Undang-Undang Nomor 8 Tahun 1999 tentang Perlindungan Konsumen dan Peraturan Pemerintah Nomor 80 Tahun 2019 tentang Perdagangan Melalui Sistem Elektronik. Anda berhak atas informasi yang benar dan jelas, produk yang layak, serta proses komplain yang adil.
      </p>
      <p>
        Produk pangan wajib ditangani sesuai keterangan kemasan. Kami hanya mengirimkan produk yang telah lolos proses operasional dan penjaminan mutu internal kami. Apabila Anda menerima produk yang tidak sesuai kondisi seharusnya, jangan dikonsumsi dan segera hubungi kami dengan bukti pendukung.
      </p>

      <h2 id="data-pribadi">12. Data Pribadi dan Privasi</h2>
      <p>
        Kami memproses data pribadi sesuai <Link href="/privacy">Kebijakan Privasi</Link> dan peraturan perundang-undangan di bidang pelindungan data pribadi yang berlaku, termasuk Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Dengan menggunakan Situs, Anda menyetujui praktik pemrosesan data sebagaimana diuraikan dalam kebijakan tersebut.
      </p>

      <h2 id="hki">13. Hak Kekayaan Intelektual</h2>
      <p>
        Seluruh merek, logo, desain antarmuka, foto produk, materi promosi, dan konten tertulis pada Situs adalah milik Yubie dan/atau pemberi lisensinya, serta dilindungi peraturan perundang-undangan tentang hak kekayaan intelektual. Penggunaan, penggandaan, atau distribusi tanpa izin tertulis dari kami dilarang.
      </p>

      <h2 id="batasan-tanggung-jawab">14. Batasan Tanggung Jawab</h2>
      <p>
        Sepanjang diizinkan oleh hukum yang berlaku, Yubie tidak bertanggung jawab atas kerugian tidak langsung yang timbul akibat penggunaan Situs di luar koridor yang wajar, gangguan pihak ketiga di luar kendali kami, atau kesalahan data yang Anda masukkan sendiri. Ketentuan ini tidak menghilangkan, membatasi, atau mengesampingkan hak-hak Anda sebagai konsumen yang dijamin peraturan perundang-undangan — termasuk hak atas produk yang layak, ganti rugi, dan pengembalian dana dalam kondisi yang diatur hukum, serta tanggung jawab kami atas kesalahan pengiriman, cacat produk, kegagalan pemenuhan pesanan, atau gangguan proses pembayaran yang berada dalam kendali kami.
      </p>

      <h2 id="keadaan-kahar">15. Keadaan Kahar (Force Majeure)</h2>
      <p>
        Kami tidak bertanggung jawab atas keterlambatan atau kegagalan pemenuhan kewajiban yang disebabkan keadaan kahar di luar kendali wajar kami, antara lain bencana alam, kebakaran, banjir, epidemi, pemogokan, kerusuhan, gangguan jaringan telekomunikasi atau listrik, kebijakan pemerintah, atau peristiwa lain yang tidak dapat diduga. Dalam keadaan demikian, kami akan menginformasikan kondisi terkini kepada Anda dan memprioritaskan penyelesaian pesanan atau pengembalian dana sebagaimana mestinya.
      </p>

      <h2 id="perubahan-ketentuan">16. Perubahan Ketentuan</h2>
      <p>
        Kami dapat mengubah Ketentuan ini dari waktu ke waktu sesuai kebutuhan operasional dan peraturan yang berlaku. Versi terbaru akan dipublikasikan pada halaman ini dengan nomor versi dan tanggal berlaku yang diperbarui. Perubahan yang bersifat material akan diinformasikan melalui kanal resmi kami. Penggunaan Situs secara berkelanjutan setelah perubahan berlaku dianggap sebagai persetujuan Anda terhadap versi terbaru.
      </p>

      <h2 id="sengketa">17. Keluhan dan Penyelesaian Sengketa</h2>
      <p>
        Keluhan dapat disampaikan melalui kanal resmi pada bagian 18. Kami menargetkan respon awal {legalPolicy.refundTimelines.acknowledgement} sejak keluhan diterima. Apabila penyelesaian internal tidak mencapai kesepakatan, Anda berhak menempuh penyelesaian sengketa sesuai peraturan perundang-undangan, termasuk melalui Badan Penyelesaian Sengketa Konsumen (BPSK) atau pengadilan yang berwenang di wilayah hukum Republik Indonesia.
      </p>
      <p>Ketentuan ini tunduk pada hukum Republik Indonesia.</p>

      <h2 id="kontak-resmi">18. Informasi Kontak Resmi</h2>
      <p>
        Email: <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> · Situs: <a href={siteConfig.origin}>{siteConfig.origin.replace("https://", "")}</a> · Wilayah usaha: {merchantIdentity.publicRegion}.
        {merchantIdentityComplete && merchantIdentity.supportPhone ? (
          <>
            {" "}
            Telepon: <a href={merchantIdentity.supportPhone.telUrl} data-merchant-field="phone">{merchantIdentity.supportPhone.value}</a>.
          </>
        ) : null}
        {merchantIdentityComplete && merchantIdentity.supportHours ? (
          <>
            {" "}
            Jam layanan pelanggan: <span data-merchant-field="support-hours">{merchantIdentity.supportHours.value}</span> (WIB).
          </>
        ) : null}
      </p>
      <p>
        Kanal lengkap dan jam layanan tersedia pada halaman <Link href="/contact">Hubungi Yubie</Link>; pertanyaan umum di halaman <Link href="/faq">FAQ</Link>.
      </p>
    </main>
  );
}
