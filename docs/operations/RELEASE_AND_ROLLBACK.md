# Rilis admin privat dan migration 0026

## Catatan review wajib

Perubahan menyentuh data pribadi staf/pelanggan, QC pangan, refund, database,
dan deployment produksi. Review harus mencakup pemisahan pembuat/penyetuju,
pencabutan hak, amount/currency match, recall/expiry, audit/outbox atomik,
receipt idempotensi, dan scope SQL role. Migration 0026 bersifat additive dan
tidak membuat stok, staf, pengiriman, pembayaran, atau persetujuan.

Rilis lama `3d5330797d53f5572819c446caf77363eaf6aa3c` tetap menjadi baseline
produksi sampai PR baru direview, lima CI wajib lulus, dan publikasi RC mendapat
approval environment. Jangan memberi label SHA lama pada source yang berubah.
RC menerbitkan API/worker/admin immutable, bundle backend/web, dan
`admin-release-manifest.json` dan `admin-materials.tgz` yang mengikat admin digest, archive, dan hash prosedurnya.
Approval deployment backend root-private dan approval frontend yang diwajibkan
prosedur tetap diperlukan; keberadaan root gateway bukan pengganti approval.

## Urutan eksekusi setelah artifact disetujui

1. Pertahankan provider ipaymu dan bekukan admission. Catat identitas runtime,
   schema, inbox, exception, dan container proyek lain. Jangan mengubah Caddy,
   Zammad, RetroPick, DNS atau secret GHCR.
2. Jalankan hanya runner baru yang dipublikasikan dari SHA yang direview. Backup
   konsisten dan restore scratch harus lolos sebelum migration 0026. Runner
   menerima baseline tepat 0022, 0025, atau schema target; 0023/24 parsial ditolak.
   Pemeriksaan independen mencakup sembilan tabel operasi, trigger immutability,
   append-only audit/receipt, dan provenance pengiriman.
3. Verifikasi API/worker digest/revision, readiness, job payment dan operations
   outbox setelah start. Tidak ada PSP switch atau aktivasi admission dari admin.
4. Siapkan konfigurasi admin minimal di secret store root-private terpisah;
   jangan gunakan seluruh production.env sebagai env_file admin. Variabel:
   `DATABASE_URL`, `ADMIN_GOOGLE_CLIENT_ID`, `ADMIN_SESSION_SECRET`,
   `ADMIN_WRITES_ENABLED`, `YUBIE_ENV`, `YUBIE_CHECKOUT_ADMISSION`, `RELEASE_SHA`.
   Default writes false. API dan admin memakai freeze database bersama; freeze harus dibuat sebelum hitung dan aktif saat apply. Env admin bukan sumber admission pelanggan. Gunakan DB role khusus `yubie_ops` tanpa superuser,
   CREATEDB, CREATEROLE, REPLICATION atau BYPASSRLS. Provision password melalui
   terminal privat, lalu jalankan `scripts/operations/admin-database-grants.sql`
   dengan psql ON_ERROR_STOP. Tidak ada izin UPDATE status/amount pembayaran.
5. Buat sertifikat TLS privat dengan SAN localhost. Klien harus mempercayai CA
   yang benar; jangan menonaktifkan pemeriksaan TLS. Direktori sertifikat
   root:10001 mode 0750, key root:10001 mode 0640, sertifikat 0644, mount read-only.
   Image admin berjalan sebagai UID/GID 10001. Env file root mode 0600.
6. Review `infrastructure/docker-compose.admin-private.yml`; project terpisah
   `yubie-ops-production`, loopback 4174, external network `yubie-prod_internal`.
   Bind hanya image digest dari admin manifest. Tidak ada port admin publik.
   Operator memakai SSH tunnel `ssh -N -L 4174:127.0.0.1:4174 yubie-vps` lalu
   membuka `https://localhost:4174`. Tidak diperlukan route Caddy baru.
7. Bootstrap subject staf asli dengan CLI `scripts/operations/bootstrap-staff.mjs`
   di image yang sama melalui operator root. Dokumen approval root-owned 0600
   dan semua parent root-controlled, memuat `action=bootstrap_named_operations_staff`,
   `sourceSha`, `approvedBy`, `approvalRef`, `notBefore`, `expiresAt` (≤1 jam), dan
   `staff: [{subject,role}]`. Tidak ada default subject, password atau secret
   OAuth di dokumen. CLI tidak dapat menimpa hak yang sudah diinisialisasi.
8. Verifikasi HTTPS health/readiness, login Google staf nyata, penolakan akun
   pelanggan, dan peran berbeda. Aktifkan operations writes hanya setelah
   approval rollout; itu tetap tidak mengaktifkan checkout atau provider charge.
9. Ulangi smoke produksi read-only dan simpan receipt SHA/digest, migration,
   backup/restore, job worker, TLS/login/peran, domain dan aset Cloudflare.

CLI bootstrap disertakan dalam image. Jalankan sebagai root hanya untuk bootstrap
dengan approval file mount read-only ke parent root-private. Runtime web tetap
UID 10001. Kredensial Google staf dan daftar subject asli belum dapat diturunkan
dari software; pengujian identitas sintetis tidak menggantikan acceptance nyata.

## Rollback

Bekukan admission terlebih dahulu jika ada insiden pembayaran. Pertahankan PSP
ipaymu, callback, reconciler, dan data pending. Untuk insiden admin, nonaktifkan
operations writes dan hentikan hanya service admin di project privat tersebut.

Migration 0026 tidak memiliki down migration otomatis. Jangan drop tabel baru,
truncate, restore backup lama di atas order sah, atau menghapus event. API/worker
3d kompatibel dengan kolom/tabel additive, tetapi worker lama tidak memproses
outbox operasi baru: backlog harus dipertahankan dan diproses setelah forward
repair. Rekonsiliasi pembayaran lama tetap harus hidup. Verifikasi kompatibilitas
dan financial state sebelum menggunakan digest rollback; jangan menganggap
rollback kode sebagai rollback database.

Frontend storefront memakai Worker Cloudflare, dua custom domain dan ASSETS.
Tidak ada perubahan DNS atau migrasi ke Vercel. Rilis ini mengubah aplikasi admin
privat; storefront hanya dirilis ulang bila artifact baru diperlukan dan approval
terpisah tersedia. Receipt harus membedakan artifact terbit dengan runtime aktif.
