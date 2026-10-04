const rows = [
  {
    label: "Kategori",
    yubie: "Minuman serbuk berbasis ubi jalar ungu",
    flimty: "Minuman serat",
    flimeal: "Meal replacement",
    wrp: "Meal replacement",
  },
  {
    label: "Fokus bahan yang dipublikasikan",
    yubie: "Ubi ungu, susu bubuk, kenari, putih telur, gula aren, L. plantarum Dad-13",
    flimty: "Psyllium husk dan campuran serat/bahan nabati",
    flimeal: "27 multigrain dan isolat protein kedelai",
    wrp: "Susu diet dengan protein, serat, vitamin, dan mineral",
  },
  {
    label: "Takaran produk",
    yubie: "45 g per sachet",
    flimty: "1 sachet; diseduh dengan 150–250 mL air",
    flimeal: "Mengikuti label varian",
    wrp: "54 g per sajian; 200 mL air",
  },
  {
    label: "Posisi penggunaan",
    yubie: "Minuman praktis; bukan klaim meal replacement atau produk pelangsing",
    flimty: "Dipasarkan brand sebagai pendamping asupan serat",
    flimeal: "Dipasarkan brand sebagai pengganti makan",
    wrp: "Dipasarkan brand sebagai pengganti sarapan atau makan malam",
  },
  {
    label: "Status data gizi",
    yubie: "Menunggu hasil lab dan persetujuan label final",
    flimty: "Brand mempublikasikan hingga 5 g serat",
    flimeal: "Brand mempublikasikan sekitar 200 kkal dan klaim gizi",
    wrp: "Brand mempublikasikan 210 kkal dan klaim gizi",
  },
];

export function ProductComparison() {
  return <section className="comparison-section section" aria-labelledby="comparison-title">
    <header className="section-head"><div><span className="eyebrow">COMPARE BY PURPOSE</span><h2 id="comparison-title">Choose by role,<br /><em>not by hype.</em></h2></div><p>Produk ini tidak setara secara fungsi. Tabel membantu membaca perbedaan format dan informasi publik—bukan menentukan produk yang “paling sehat”.</p></header>
    <div className="comparison-scroll" tabIndex={0} aria-label="Tabel perbandingan produk minuman serbuk">
      <table className="comparison-table">
        <thead><tr><th scope="col">Yang dibandingkan</th><th scope="col" className="yubie-column">Yubie Shake</th><th scope="col">Flimty Fiber</th><th scope="col">Flimeal</th><th scope="col">WRP Meal Replacement</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td className="yubie-column">{row.yubie}</td><td>{row.flimty}</td><td>{row.flimeal}</td><td>{row.wrp}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="comparison-note">Catatan riset: komposisi Yubie berasal dari product brief Oktober 2026; nilai gizi belum boleh dipublikasikan sebelum hasil laboratorium disetujui. Informasi pembanding diringkas dari halaman resmi <a href="https://flimty.com/" target="_blank" rel="noreferrer">Flimty Fiber</a>, <a href="https://flimty.com/flimeal/" target="_blank" rel="noreferrer">Flimeal</a>, dan <a href="https://wrp.co.id/produk/wrp-meal-replacement-chocolate-2/" target="_blank" rel="noreferrer">WRP</a>, diakses 4 Oktober 2026. Klaim brand lain ditampilkan sebagai posisi produsennya, bukan validasi klinis oleh Yubie.</p>
  </section>;
}
