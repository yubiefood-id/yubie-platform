# Storefront Deploy Receipt — City Selection UX (PR #77)

- **Recorded (UTC):** see git commit date
- **Deployed at (UTC):** ~2026-11-01T17:2x (wrangler upload 18.17s)
- **Source:** PR #77 merge commit `77b9fdbc8e4f9c86f69d005dc98d1f7256cff5c4` (`main`, CI run 41329926515 — 5/5 green)
- **Worker:** `yubie-web-production` · both custom domains + ASSETS preserved
- **New version:** `0e39ca6a-acb2-4891-9d92-b09b4964c58b` · **Rollback:** `7e55c23b-e12f-473d-9436-e8b46bee2c88`
- **Build:** isolated worktree · `web.release_verified` · digest `sha256:4dd56cdc19aa4b0a40b41a8175c2532f70c45ea203489131931c1f68c0aa81d7`
- **Authorization:** explicit owner instruction (session 2026-11-01), per CONTROLLED_RELEASE frontend approval.

## Change (owner request)

Kolom kota menjadi dropdown pilihan kota tercakup gratis ongkir (hari ini: Kabupaten Bogor) dan instruksi gratis ongkir ditempatkan tepat di bawah kolomnya — sebelum memilih: daftar kota yang gratis; sesudah memilih: konfirmasi Rp0 termasuk total. Opsi "Kota lain…", kota hasil geolokasi di luar cakupan, dan kegagalan memuat daftar tetap memakai input teks + datalist. Server quote tetap otoritas tunggal; chips lama dihapus; aria-label eksplisit "Kota".

## Live verification (https://yubiefood.com, 390px + touch, 0 console errors)

`<select>` berisi ["Pilih kota/kabupaten…", "Kabupaten Bogor", "Kota lain…"]; hint sebelum → "🚚 Gratis ongkir (Rp0) saat ini tersedia untuk: Kabupaten Bogor. Pilih kota Anda di atas."; sesudah → "🚚 Gratis ongkir — pengiriman ke Kabupaten Bogor gratis (Rp0) dan sudah termasuk dalam total."; tombol Bayar ENABLED setelah form lengkap; catatan ringkasan gratis ongkir tampil; tanpa overflow 390px; /faq /terms /refund-policy /contact /privacy → 200.

Biteship tetap nonaktif (web-only deploy; backend/migrasi/env tak tersentuh). Merchant identity masih GATED (iPaymu submission menunggu data owner).
