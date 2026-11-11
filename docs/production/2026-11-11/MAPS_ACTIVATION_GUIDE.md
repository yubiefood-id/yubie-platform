# Panduan Aktivasi Google Maps — Checkout Isi Otomatis

Tanggal: 2026-11-11 · Prasyarat: project Google Cloud ("yubie staging") sudah di-approve untuk Maps APIs. Kode fitur sudah siap dan **fail-closed** — tanpa kunci, situs tetap jalan normal (tombol lokasi & pencarian menampilkan pesan jujur, pengisian manual selalu tersedia).

## Bagian A — Siapkan 3 kredensial di Google Cloud Console

1. Buka https://console.cloud.google.com/ dan pastikan project **yubie staging** terpilih (dropdown project kiri atas).
2. Menu kiri → **APIs & Services** → **Library**.
3. Cari dan aktifkan satu per satu (tombol **Enable**):
   1. **Maps JavaScript API**
   2. **Geocoding API**
   3. **Places API (New)** — pastikan yang bertuliskan "(New)", bukan "Places API" lama.
4. Menu **APIs & Services** → **Credentials** → tab **Credentials**.
5. **Kredensial 1 — Server key** (dipakai API Yubie di server, TIDAK boleh terekspos browser):
   1. Klik **+ Create Credentials** → **API key** → salin nilainya (mulai biasanya `AIza…`) → simpan sementara sebagai `SERVER_KEY`.
   2. Klik ikon titik tiga pada key itu → **Edit API key**.
   3. **API restrictions** → pilih **Restrict key** → centang **Geocoding API** dan **Places API (New)** → **Save**.
6. **Kredensial 2 — Browser key** (dipakai widget peta di browser, memang publik tapi dibatasi referrer):
   1. **+ Create Credentials** → **API key** → simpan sebagai `BROWSER_KEY`.
   2. Edit key → **Application restrictions** → **HTTP referrers (web sites)** → tambahkan dua baris:
      - `https://yubiefood.com/*`
      - `https://next.yubiefood.com/*`
   3. **API restrictions** → Restrict key → centang **Maps JavaScript API** → **Save**.
7. **Kredensial 3 — Map ID** (untuk Advanced Markers pada pin peta):
   1. Menu → **Google Maps Platform** → **Map Management** (https://console.cloud.google.com/google/maps-hosted-maps).
   2. **Create Map ID** → nama bebas mis. `Yubie Checkout` → **Map type: JavaScript** → **Create**.
   3. Salin **Map ID**-nya (format `xxxxxxxx-xxxx…` ATAU nama singkat seperti `yubie_checkout` — salin persis).
   4. Klik Map ID itu → pastikan **Map Style** memakai style dengan **Advanced Markers enabled** (Cloud-based map styling; jika belum, buat style baru di **Map Styles** dengan Advanced Markers ON lalu hubungkan).
8. **Billing**: menu **Billing** — pastikan akun billing tertaut ke project (Maps memberi kredit bulanan; tanpa billing API akan menolak panggilan).

## Bagian B — Pasang kunci (butuh nilai dari Bagian A)

### B1. Server key → API production (VPS)

> PENTING: `MAPS_PROVIDER=google` dan `GOOGLE_MAPS_SERVER_KEY` HARUS diset BERSAMAAN. Kalau `google` tanpa key, API akan menolak start (fail-closed by design).

1. SSH ke VPS: `ssh yubie-vps`.
2. Edit env produksi: `sudo nano /etc/yubie/production.env` — tambahkan/ubah dua baris:
   ```text
   MAPS_PROVIDER=google
   GOOGLE_MAPS_SERVER_KEY=<SERVER_KEY>
   ```
3. Recreate container API (admission & pembayaran TIDAK tersentuh):
   `cd /opt/yubie/production && sudo docker compose -f docker-compose.prod.yml up -d --no-deps api`
4. Verifikasi: `curl -s https://api.yubiefood.com/v1/auth/session | grep -o 'mapsAvailable[^,]*'` → harus `mapsAvailable":true`.
5. Uji cepat tombol 📍 di https://yubiefood.com/checkout — alamat/kota/kode pos harus terisi.
6. Rollback bila perlu: kembalikan `MAPS_PROVIDER=disabled` (hapus/ kosongkan kedua baris) lalu ulangi langkah 3.

### B2. Browser key + Map ID → build web

1. Dari checkout bersih SHA yang sudah di-merge, build dengan env tambahan:
   ```bash
   NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE=DIRECT_COMMERCE_PRODUCTION \
   NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<BROWSER_KEY> \
   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<MAP_ID> \
   npm run build --workspace @yubie/web
   node apps/web/scripts/verify-release.mjs <SHA-penuh>
   cd apps/web && npx wrangler deploy -c wrangler.prod.jsonc
   ```
2. (Opsional, agar CI ikut membakarnya di RC berikutnya) GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret** dua kali: `GOOGLE_MAPS_BROWSER_KEY` dan `GOOGLE_MAPS_MAP_ID`.
3. Verifikasi pasca-deploy: pin peta muncul setelah tombol lokasi / pilih saran pencarian; geser pin memperbarui alamat.
4. Rollback: deploy ulang build tanpa dua env tersebut (peta mematangkan diri jadi pesan "Peta belum dapat dimuat", pengisian manual tetap jalan).

## Bagian C — Batasan & biaya (sudah terpasang di kode)

- Rate limit bawaan: 20 permintaan/menit per browser, 40/menit per IP, **500/hari global** — pembatas biaya utama.
- Hasil lokasi dibatasi wilayah Indonesia; tidak ada koordinat/alamat yang dicatat di log atau analytics.
- Urutan aktivasi bebas, tapi pengalaman penuh (tombol GPS + pencarian + pin peta) butuh B1 DAN B2. B1 saja → GPS + pencarian jalan, peta tampil pesan fallback. B2 saja → hanya peta yang gagal berbingkai kunci server (tombol tetap tidak bisa mengisi).
