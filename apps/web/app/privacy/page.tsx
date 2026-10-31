import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";
import { legalPolicy, merchantIdentity } from "@/config/merchant-identity";

export const metadata: Metadata = {
  title: "Kebijakan Privasi Yubie",
  description:
    "Bagaimana Yubie mengumpulkan, menggunakan, membagikan, menyimpan, dan melindungi data pribadi Anda: data pesanan, alamat, lokasi, akun, pembayaran, serta hak Anda menurut UU 27/2022 tentang Pelindungan Data Pribadi.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main id="main" className="legal-page">
      <span className="eyebrow">PRIVACY</span>
      <h1>Kebijakan Privasi Yubie</h1>
      <p className="legal-meta">
        Versi {legalPolicy.version} · Berlaku efektif sejak {legalPolicy.effectiveDate} (WIB). Kebijakan ini merupakan bagian dari{" "}
        <Link href="/terms">Syarat &amp; Ketentuan Yubie</Link>.
      </p>

      <h2 id="ringkasan">Ringkasan</h2>
      <p>
        Yubie (pengelola situs {siteConfig.origin.replace("https://", "")}) menghormati dan melindungi data pribadi Anda. Kebijakan ini menjelaskan data apa yang kami kumpulkan, untuk apa digunakan, kepada siapa dibagikan, berapa lama disimpan, bagaimana kami melindunginya, dan hak-hak Anda menurut Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).
      </p>

      <h2 id="data-yang-dikumpulkan">Data yang Kami Kumpulkan</h2>
      {directCommerce ? (
        <ul>
          <li>
            <strong>Data pesanan dan kontak:</strong> nama, alamat email, nomor WhatsApp/telepon, nama penerima, alamat pengiriman lengkap (alamat, kota, kode pos), serta isi keranjang dan pesanan — diperlukan untuk memproses dan mengirim pesanan Anda.
          </li>
          <li>
            <strong>Data lokasi (opsional, hanya dengan izin Anda):</strong> bila Anda menekan tombol deteksi lokasi atau menggeser pin peta saat checkout, koordinat lokasi dikirim ke server kami untuk diterjemahkan menjadi saran alamat (wilayah Indonesia). Saran tersebut selalu dapat Anda periksa dan ubah — tidak ada data lokasi yang dikirim tanpa tindakan Anda, dan izin lokasi dapat Anda cabut kapan saja melalui pengaturan peramban.
          </li>
          <li>
            <strong>Data akun (opsional):</strong> bila Anda masuk dengan Google, kami memproses email, nama, dan foto profil akun Google Anda untuk keperluan sesi dan riwayat pesanan.
          </li>
          <li>
            <strong>Data pembayaran:</strong> kami tidak pernah menyimpan nomor kartu, PIN, atau OTP. Untuk setiap pesanan, alamat email dan nomor telepon Anda diteruskan terbatas kepada penyedia pembayaran (iPaymu) guna pembuatan tagihan; status pembayaran kami terima dari penyedia tersebut dalam bentuk referensi transaksi.
          </li>
          <li>
            <strong>Data formulir opsional:</strong> newsletter, waitlist produk, dan formulir B2B — hanya diproses setelah Anda memberi persetujuan pada formulir terkait.
          </li>
        </ul>
      ) : (
        <ul>
          <li>
            <strong>Data formulir opsional:</strong> newsletter, waitlist produk, dan formulir B2B — hanya diproses setelah Anda memberi persetujuan pada formulir terkait.
          </li>
        </ul>
      )}
      <ul>
        <li>
          <strong>Data teknis:</strong> penyedia infrastruktur kami memproses data teknis permintaan (seperti alamat IP dan jenis peramban) sebatas diperlukan untuk menyajikan dan mengamankan situs. Kami menggunakan pelacakan analitik internal pihak pertama yang difilter untuk tidak menyimpan konten bebas, nomor telepon, email, atau alamat.
        </li>
      </ul>

      <h2 id="dasar-pemrosesan">Dasar dan Tujuan Pemrosesan</h2>
      <p>Kami memproses data pribadi Anda atas dasar yang sesuai dengan UU PDP, antara lain:</p>
      <ul>
        <li>
          <strong>pelaksanaan perjanjian/perjanjian yang diajukan konsumen</strong> — memproses pesanan, pembayaran, pengiriman, penanganan komplain, dan refund;
        </li>
        <li>
          <strong>persetujuan Anda</strong> — deteksi lokasi saat checkout, pengiriman newsletter/waitlist, dan pengisian formulir B2B, yang dapat Anda cabut kapan pun;
        </li>
        <li>
          <strong>kepentingan yang sah</strong> — menjaga keamanan situs (antara lain deteksi penyalahgunaan) dan meningkatkan kualitas layanan berdasarkan analitik yang difilter.
        </li>
      </ul>
      <p>Data pribadi tidak kami jual atau bagikan untuk iklan pihak ketiga.</p>

      <h2 id="penerima-data">Penerima dan Pemroses Data</h2>
      <p>Data pribadi Anda hanya dibagikan sebatas yang diperlukan kepada:</p>
      <ul>
        <li>
          <strong>penyedia pembayaran (iPaymu)</strong> — email dan nomor telepon untuk pembuatan tagihan serta verifikasi transaksi;
        </li>
        <li>
          <strong>jasa kurir</strong> — nama penerima, alamat, dan nomor telepon untuk pengiriman pesanan;
        </li>
        <li>
          <strong>penyedia infrastruktur situs dan layanan pendukung</strong> (antara lain hosting dan layanan peta/otentikasi Google) selaku pemroses yang terikat untuk memproses data hanya atas instruksi kami;
        </li>
        <li>
          <strong>kanal layanan pelanggan resmi Yubie</strong> — bila Anda menghubungi kami melalui kanal tersebut.
        </li>
      </ul>
      <p>
        Kami dapat mengungkapkan data bila diwajibkan oleh peraturan perundang-undangan atau putusan aparat penegak hukum yang sah. Kanal eksternal lain (misalnya media sosial atau grup komunitas WhatsApp) memiliki kebijakan privasinya masing-masing dan tidak kami gunakan untuk memproses data pesanan.
      </p>

      <h2 id="penyimpanan">Penyimpanan dan Retensi</h2>
      <p>
        Data pesanan dan catatan keuangan disimpan selama diperlukan untuk memenuhi tujuan pemrosesan serta kewajiban hukum dan pembukuan yang berlaku. Data formulir opsional disimpan hanya selama tujuan langganannya berlaku atau sampai Anda meminta penghapusan. Pesanan cadangan (checkout belum dibayar) kedaluwarsa otomatis dalam 24 jam.
      </p>
      <p>Kami menerapkan prinsip bahwa data pribadi tidak disimpan lebih lama dari yang diperlukan; penghapusan dilakukan dengan mempertimbangkan kewajiban retensi hukum kami.</p>

      <h2 id="keamanan">Keamanan Data</h2>
      <ul>
        <li>Seluruh akses publik situs dilindungi HTTPS (TLS).</li>
        <li>Halaman pembayaran ditangani penyedia pembayaran resmi; kami tidak pernah meminta dan tidak menyimpan PIN, OTP, password, atau data kartu lengkap.</li>
        <li>Akses internal terhadap data pelanggan dibatasi berdasarkan peran dan dicatat (hanya personel operasional yang berwenang dapat melihat data pengiriman pesanan).</li>
        <li>Analitik internal difilter untuk meniadakan konten bebas dan penanda pribadi seperti email, nomor telepon, dan alamat.</li>
      </ul>

      <h2 id="hak-anda">Hak Anda</h2>
      <p>Sesuai UU PDP, Anda berhak untuk — antara lain — memperoleh informasi, mengakses, memperbaiki, meminta penghapusan, menarik persetujuan, serta mengajukan keberatan atas pemrosesan data pribadi tertentu. Untuk menggunakan hak tersebut:</p>
      <ol>
        <li>
          Kirim email ke <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> dengan subjek &quot;Permintaan Data Pribadi&quot;.
        </li>
        <li>Sertakan nomor pesanan (bila terkait pesanan) dan identitas yang diperlukan untuk memverifikasi kepemilikan data.</li>
        <li>Kami akan menanggapi dan menindaklanjuti permintaan Anda sesuai ketentuan yang berlaku.</li>
      </ol>

      <h2 id="cookie">Cookie dan Pelacakan</h2>
      <p>
        Kami menggunakan cookie dan penyimpanan peramban yang diperlukan untuk fungsi situs — antara lain sesi login (opsional), sesi checkout tamu, preferensi keranjang, dan perlindungan CSRF. Kami tidak memasang skrip pelacakan iklan pihak ketiga. Analitik kami berupa event internal pihak pertama yang telah difilter sebagaimana dijelaskan di atas.
      </p>

      <h2 id="perubahan">Perubahan Kebijakan</h2>
      <p>
        Kebijakan ini dapat kami perbarui sewaktu-waktu; versi terbaru dipublikasikan di halaman ini dengan nomor versi dan tanggal berlaku yang diperbarui. Perubahan material akan diinformasikan melalui kanal resmi kami.
      </p>

      <h2 id="kontak-privasi">Kontak Privasi</h2>
      <p>
        Pertanyaan tentang kebijakan ini atau data pribadi Anda: <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. Kanal resmi kami selengkapnya di halaman <Link href="/contact">Hubungi Yubie</Link>; identitas pengelola tercantum pada <Link href="/terms">Syarat &amp; Ketentuan</Link> bagian 2. Wilayah usaha: {merchantIdentity.publicRegion}.
      </p>
    </main>
  );
}
