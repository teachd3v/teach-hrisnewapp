# Pedoman UI/UX (aplikasi mobile native)

Aplikasi ini target utamanya **aplikasi HP (Tauri)**; web hanya cadangan. Semua layar dirancang untuk layar sentuh 360-430 px dulu.

## Struktur navigasi
- **Tab bar bawah (5 tujuan):** Beranda, Cuti, Persetujuan, Notifikasi, Akun. Lencana untuk notifikasi belum dibaca dan pengajuan yang menunggu persetujuan.
- **Layar dalam** (ajukan cuti, menu admin, form karyawan): tombol kembali di kiri atas, tanpa tab bar. Bila dibuka langsung (tautan dalam), kembali ke layar induk (`handle.back` di rute), bukan keluar aplikasi.
- Menu admin ada di tab Akun (hanya tampil untuk admin).
- Router memakai data router (`createBrowserRouter`); judul header dari `handle.title`.

## Aturan visual (`web/src/index.css`, `web/src/ui.tsx`)
- Tema terang saja (latar putih, teks hitam) sesuai kesepakatan; token warna semantik, tanpa hex di komponen. Teks >= 4,5:1; batas kolom isian >= 3:1.
- Target sentuh >= 48 px (tombol, kolom, baris menu, tab); jarak antar target >= 8 px.
- Kolom isian 16 px (iOS tidak zoom otomatis), label selalu terlihat, galat tepat di bawah kolom, tipe keyboard sesuai (`email`, `tel`, `decimal`).
- Umpan balik tekan lewat warna (`active:`), tidak menggeser tata letak. Status memakai teks, bukan warna saja.
- Keputusan/konfirmasi memakai **lembar dari bawah** (`Sheet`): Esc/ketuk latar menutup, fokus dipindah dan dikembalikan ke elemen pembuka, galat tetap di dalam lembar. Catatan teknis: efek fokus `Sheet` hanya boleh bergantung pada `open` (bukan `onClose`, yang berganti identitas tiap render induk); bila tidak, kolom ketik di dalam lembar kehilangan fokus setiap ketikan (bug yang pernah terjadi di filter log).
- Aksi utama form ada di bilah bawah yang menempel (`BottomBar`) di atas inset aman.
- Inset aman (`env(safe-area-inset-*)`) untuk header, tab bar, bilah bawah; `viewport-fit=cover`. Zoom tidak dimatikan.
- Rasa native: tanpa sorotan ketuk, tanpa tarik-muat-ulang browser (`overscroll-behavior`), tanpa jeda ketuk, teks tidak terseleksi kecuali di kolom isian atau yang diberi `data-selectable`.
- Animasi singkat (180-220 ms) dan mati bila `prefers-reduced-motion`.
- Ikon: `lucide-react` (satu keluarga, garis), dekoratif disembunyikan dari pembaca layar, kontrol ikon punya nama aksesibel.

- **Tarik-untuk-segarkan** (`web/src/lib/pull-to-refresh.tsx`): tarik ke bawah saat layar di paling atas memuat ulang data layar aktif (TanStack Query), bukan seluruh halaman. Tidak aktif bila layar sedang tergulir, saat mulai dari kolom isian/lembar, atau tarikan pendek. Data juga otomatis segar saat aplikasi kembali dibuka (`refetchOnWindowFocus`) dan notifikasi tiap 60 detik.

## Belum dikerjakan
- Mode gelap (sengaja ditunda; tema terang disepakati).
- Gestur geser, haptics (butuh plugin Tauri), dan splash screen.
- Uji di perangkat nyata: inset aman (poni, indikator gestur), keyboard menutupi kolom, ukuran font sistem terbesar, TalkBack/VoiceOver. Yang sudah dicek hanya emulasi 375 x 812 di browser.
- Halaman Spike (`/spike`) masih tampilan lama (halaman uji, bukan fitur).

## Logo dan ikon
Sumber logo: `design/logo-source.png` (400 x 400, hitam di atas latar putih keabu-abuan). Semua ikon dibuat ulang dengan `python scripts/make-icons.py` (butuh Pillow): logo diubah menjadi mask tinta (derau dibuang, dipotong rapat, diperbesar dan ditajamkan) lalu ditempel ke tiap kanvas.
- `web/public/icons/`: `icon-192/512.png` (aplikasi terpasang), `icon-maskable-512.png` (di dalam zona aman), `apple-touch-icon.png`, `favicon-32.png`, `badge-96.png` (siluet putih transparan untuk bilah status Android), `logo-mark-256.png` (lambang transparan untuk layar login); `web/public/favicon.ico`.
- `design/icon-master-1024.png` -> `cd web && npx tauri icon ../design/icon-master-1024.png` menghasilkan ikon Tauri (`web/src-tauri/icons`, termasuk Android, iOS, Windows, macOS).
- Mengganti logo: timpa `design/logo-source.png` (idealnya lebih besar, 1024 px, latar polos), jalankan kedua perintah di atas. Bila latar sumber bukan ~putih (253) atau tinta bukan ~hitam (21), sesuaikan `BG_SRC`/`INK_SRC` di skrip.
- Keterbatasan: sumber hanya 400 px, jadi tepi di ukuran besar (master 1024 dan ikon 512) hasil pembesaran yang ditajamkan, bukan vektor asli. Berkas vektor (SVG) atau PNG >= 1024 px akan lebih tajam.
