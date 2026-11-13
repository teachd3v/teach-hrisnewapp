# Face recognition presensi (rencana)

**Status: Fase 1 dibangun 2026-11-11 (mode Mati/Hanya ditandai), belum dideploy dan belum diuji di HP nyata.** Keputusan: `docs/DECISIONS.md` ("Sudah dibangun" nomor 9). Bagian di bawah ini adalah rencana dan hasil spike yang mendasarinya; ringkasan fitur yang berjalan ada di "Yang dibangun".

## Yang dibangun (Fase 1)
- **Skema:** migrasi `0016_face_verification.sql`: tabel `face_templates` (vektor base64 float32, status pending/approved/rejected, persetujuan, foto referensi di R2 `face_reference/`) dan kolom `clock_{in,out}_face_score`, `_face_result`, `_live`, `_face_vec` di `attendances`.
- **Shared** (`shared/src/face.ts`): `assessFace` (urutan: tanpa template/skor -> `none`; liveness di bawah ambang -> `spoof`; skor >= ambang -> `match`, selain itu `mismatch`), `cosine`/`bestScore`, `encodeVectors`/`decodeVectors`, `parseFaceSettings`, teks persetujuan, notifikasi.
- **API:** `/api/face` (`GET /status`, `POST /enroll`, `DELETE /me`, HC: `GET /admin`, `POST /:id/decision`, `DELETE /employee/:id`, super admin: `PUT /settings`); `clock-in`/`clock-out` menerima `embedding` dan `live`; `GET /api/attendance/admin` menyertakan skor, karyawan hanya melihat hasil. Foto referensi dibuka lewat `/api/files/link` (pemilik dan admin; akses admin diaudit).
- **Web:** `lib/face-ml.ts` (muat model, penyelarasan, embedding, liveness), layar `FaceEnroll` (Akun > Wajah untuk presensi), antrean HC `AdminFace`, bagian Verifikasi wajah di Pengaturan presensi, verifikasi di layar kamera presensi (embedding dihitung saat foto diambil), penanda hasil di riwayat dan layar HC.
- **Verdict sebelum kirim (2026-11-12, migrasi 0017):** `POST /api/face/verify` mengembalikan hasil saja (tanpa skor) agar kartu foto bisa tampil hijau "Verified Face" / merah "Face not Verified" dan karyawan dapat mengulang; dibatasi 10 percobaan per 10 menit dan dicatat di `face_attempts` (hasil saja) supaya HC melihat berapa kali gagal. Sebelum memanggil server, HP memeriksa ketajaman (>= 120) dan arah wajah (|yaw| <= 0,15); foto yang tidak lolos tampil abu-abu "belum bisa diverifikasi", bukan merah. Saat merah tersedia "Kirim tetap" (ditandai untuk HC). Diperbaiki juga: `capture()` membaca status wajah lewat ref karena loop kamera dibuat sebelum status selesai dimuat (sebelumnya verifikasi bisa terlewat pada kunjungan pertama). pengaturan di `app_settings` (bukan kolom aturan berefektif-tanggal); aturan selisih tidak dipakai karena presensi adalah verifikasi 1:1 terhadap template sendiri; pendaftaran memakai gerbang ketajaman dan pembuangan sampel pencilan; mode blokir, kolom wajah di Rekap Excel, dan verifikasi ulang sampling belum dibuat.
- **Pendaftaran hadap depan (2026-11-13), menggantikan putaran kepala melingkar.** Uji pemilik di HP: putaran 8 arah lambat dan harus diulang-ulang. Sebabnya: sampel ditolak bila buram padahal kepala sedang bergerak, deteksi berhenti ±450 ms tiap embedding sehingga arah terlewat, dan ukuran angguk (pitch) kasar. Manfaatnya juga kecil: presensi hanya memverifikasi wajah hadap depan (|yaw| <= 0,15) sedangkan sampel menoleh diambil pada yaw >= 0,2, dan karena pencocokan memakai skor tertinggi, sampel pose ekstrem menambah peluang salah orang (lihat uji dua orang di bawah). Sekarang: wajah di tengah, lurus (|yaw| < 0,15), diam 0,4 detik, lalu 5 sampel otomatis berjeda 0,3 detik dengan gerbang ketajaman (>= 150) dan pembuangan pencilan; `FACE_ENROLL_MIN` turun dari 6 ke 3 agar satu-dua sampel terbuang tidak memaksa mengulang; "Selesai" tersedia sejak 3 sampel. Skor wajah asli (MiniFASNet, median sampel) ikut dikirim di `stats.live` dan antrean HC menampilkan penanda "Diduga foto/layar" bila di bawah ambang; **hanya penanda, tidak menolak**, karena ambangnya belum diuji dengan serangan berlabel. Template lama (sampai 10 sampel dari pendaftaran melingkar) tetap sah dan tidak diubah. **Belum diuji di HP nyata** (kamera diblokir di panel uji).
- **Diverifikasi:** typecheck semua workspace, build produksi, `shared/face` (unit), API ujung-ke-ujung terhadap wrangler lokal (validasi pendaftaran, hak akses, persetujuan, hasil presensi `match`/`spoof`/`none`, skor tersembunyi dari karyawan, penghapusan, audit), pemuatan model di bundel dev dan produksi, layar status/persetujuan/antrean HC/pengaturan di browser. **Belum:** kamera dan pendaftaran melingkar di HP nyata (kamera diblokir di panel uji), iPhone.

## Kondisi sekarang
`@mediapipe/tasks-vision` `FaceDetector` di perangkat hanya memastikan ada wajah (`clock_in_face` / `clock_out_face`, boolean). Bukan verifikasi identitas; foto dinilai manual oleh HC (`docs/PRESENSI.md`, "Batasan").

## Arsitektur hybrid
| Di HP | Di server (Worker) |
|---|---|
| Kamera dan deteksi wajah (sudah ada) | Menyimpan template per karyawan |
| Hitung embedding dari **foto final** yang akan dikirim | Mencocokkan embedding dengan template (template tidak dikirim ke HP) |
| (Fase 2) menjalankan tantangan liveness | (Fase 2) membuat dan memeriksa tantangan acak |

Alur presensi: ambil foto -> hitung embedding dari foto itu -> kirim bersama `photo`, lokasi, `face` -> server menghitung cosine terhadap template -> simpan `face_score` dan `face_result` sebagai snapshot -> audit. Karena embedding berasal dari foto yang sama dengan yang disimpan di R2, hasilnya dapat dihitung ulang kapan saja (sampling) untuk mendeteksi klien yang memalsukan embedding.

Hasil: `match`, `uncertain`, `mismatch` (ada template tetapi tidak cocok), `none` (karyawan belum punya template yang disetujui, atau embedding tidak tersedia). Presensi koreksi HC selalu `none`.

## Fase 1: enrollment + pencocokan mode `flag`
Tujuan: mengumpulkan data skor nyata tanpa memblokir siapa pun, sambil memberi HC penanda yang berguna.

### Cakupan
- Karyawan mendaftarkan wajah (persetujuan biometrik, 5 sampel).
- HC menyetujui atau menolak pendaftaran.
- Setiap presensi yang dilakukan karyawan bertemplate disimpan dengan skor dan hasilnya; tidak ada yang ditolak karena wajah.
- Penanda di layar HC dan di Rekap Excel.
- Saklar `face_mode` (`off` / `flag`) di Pengaturan presensi, super admin yang mengubah.

### Di luar Fase 1
Liveness (Fase 2), kalibrasi ambang (Fase 3), mode `block` (Fase 4), verifikasi ulang di server.

### Pekerjaan, berurutan
1. **Keputusan prasyarat** (DECISIONS nomor 2, diputuskan 2026-11-11): tujuan anti titip absen; HC menyetujui dengan mencocokkan KTP; template dihapus saat keluar/nonaktif atau persetujuan ditarik; kamera sistem tetap boleh tetapi hasilnya `uncertain`. **Tersisa:** model dan lisensinya (spike) serta teks persetujuan UU PDP.
2. **Spike model embedding** (sebelum migrasi): pilih model (kandidat keluarga MobileFaceNet/ArcFace dengan bobot berlisensi yang boleh dipakai), ukur ukuran unduhan, waktu hitung di Android kelas menengah dan iPhone (pengguna sekitar 20-30 Android, 5-6 iPhone), dan skor orang sama vs orang berbeda pada beberapa karyawan sukarelawan. Hasilnya menetapkan model, dimensi vektor, dan ambang awal (hanya untuk penanda `uncertain`). Berkas model diletakkan di `web/public/models` (sudah ada) dan di-cache oleh `sw.js`.
3. **Migrasi 0016** (`api/migrations`, nomor berikutnya setelah 0015):
   - `face_templates`: `id`, `employee_id`, `vectors` (blob, N x float32 ternormalkan), `model_version`, `status` (`pending` / `approved` / `rejected` / `revoked`), `consent_at`, `consent_version`, `reference_photo_key`, `created_at`, `decided_by`, `decided_at`, `decision_note`. Satu template `approved` aktif per karyawan.
   - `attendances`: kolom terpisah masuk dan pulang mengikuti pola yang ada (`clock_in_face_score`, `clock_in_face_result`, `clock_in_face_model`, `clock_in_face_embedding`; padanan `clock_out_*`).
   - `attendance_policies`: `face_mode` (bawaan `off`; berlaku mulai tanggal tertentu seperti aturan lain).
   - Ingat: migrasi D1 dijalankan manual sebelum push kode yang membutuhkannya (`DECISIONS.md`, Sumber daya Cloudflare).
4. **Shared** (`shared/src/face.ts`): `cosine`, `assessFace(score, thresholds)` dan konstanta ambang, dipakai server (resmi) dan HP (informasi), mengikuti pola `assessLocation`.
5. **API** `/api/face`: `POST /enroll` (multipart: sampel foto + embedding + persetujuan), `GET /me` (status pendaftaran, tanpa vektor), `DELETE /me` (tarik persetujuan), admin: `GET /pending`, `POST /:id/decision`, `DELETE /:id` (cabut/reset). Foto referensi di R2 dengan tautan bertanda tangan seperti foto presensi; akses admin dicatat audit. Semua aksi tercatat di audit (`shared/src/audit-labels.ts`).
6. **Presensi** (`api/src/routes/attendance.ts`): `clock-in` / `clock-out` menerima field `embedding`, menilai terhadap template `approved`, menyimpan skor dan hasil. Dalam mode `flag` presensi tidak pernah ditolak karena wajah. Validasi embedding (panjang, angka berhingga, norma wajar) agar input rusak tidak menjatuhkan permintaan.
7. **Web**:
   - `web/src/lib/face-embed.ts`: memuat model (lazy, setelah detektor), menghitung embedding dari `Blob` hasil `snapshot()`; gagal dimuat -> presensi tetap berjalan, `face_result = none`.
   - `AttendanceCapture.tsx`: hitung embedding setelah foto diambil, kirim lewat `FormData`. Jalur "Buka kamera sistem" menghasilkan embedding dari berkas itu tetapi ditandai tidak melalui deteksi langsung.
   - `FaceEnroll` di Profil (persetujuan, 5 sampel dengan arahan sudut, pratinjau, kirim).
   - Antrean persetujuan wajah untuk HC di Akun (membandingkan foto referensi dengan foto KTP di Dokumen).
   - Penanda di kartu presensi HC, dan pengaturan `face_mode` di `AdminAttendanceSettings.tsx`.
8. **Rekap Excel**: kolom hasil wajah per hari dan hitungan `uncertain` / `mismatch` per karyawan di Ringkasan (`shared/src/report.ts`, `api/src/lib/report.ts`, `web/src/lib/report-xlsx.ts`).
9. **Dokumentasi dan uji**: perbarui `docs/PRESENSI.md` (alur, API, batasan) dan dokumen ini; uji di HP Android dan iPhone nyata (kamera, unduhan model, waktu hitung, PWA terpasang di iOS), serta uji kasus: belum terdaftar, model gagal dimuat, daftar ulang, cabut template, dua permintaan presensi bersamaan.

### Kriteria selesai Fase 1
- Karyawan dapat mendaftar, HC dapat menyetujui/menolak/mencabut, semua tercatat di audit.
- Presensi karyawan bertemplate menyimpan skor dan hasil; karyawan tanpa template tetap bisa presensi (`none`).
- HC melihat penanda di layar dan Rekap; tidak ada presensi yang ditolak karena wajah.
- Pengujian di HP nyata lolos, dan distribusi skor setidaknya 2 minggu siap dianalisis untuk Fase 3.

## Hasil spike tahap 1: riset lisensi model (2026-11-11)
Berdasarkan pencarian web (sebagian besar sumber sekunder: halaman Hugging Face dan mirror), **bukan** pembacaan berkas LICENSE asli. Periksa langsung berkas LICENSE sebelum model dipakai di produksi.

| Kandidat | Lisensi bobot | Ukuran / dimensi | Catatan |
|---|---|---|---|
| InsightFace (buffalo_l/s, w600k_mbf, ArcFace glintr100) | **Non-komersial/riset saja**; kode MIT, bobot butuh lisensi berbayar | 512-d | **Dicoret** tanpa lisensi komersial. Ini yang paling umum beredar sebagai "MobileFaceNet ONNX". |
| MobileFaceNet mirror lain (foamliu, Qualcomm AI Hub, dll.) | **Tidak jelas** (LICENSE kosong/tidak ditemukan; data latih umumnya MS-Celeb-1M/VGGFace2 dengan batasan riset) | - | Dicoret sampai terbukti. |
| FaceX, LVFace | Bobot CC BY-NC-SA / non-komersial | - | Dicoret. |
| **SFace** (OpenCV Zoo, `face_recognition_sface_2021dec`) | Repo OpenCV Zoo Apache-2.0; folder SFace punya LICENSE sendiri (**isi belum terbaca**) | int8 **9,9 MB**, fp32 38,7 MB; dimensi dan data latih **belum terkonfirmasi** (jaringan MobileFaceNet dengan loss SFace) | Kandidat utama: kecil dan cocok untuk HP. Perlu baca LICENSE dan sumber data latihnya. |
| AuraFace v1 (fal.ai) | Apache-2.0 (kartu model) | 512-d, ResNet-100, ~65 jt parameter, bobot ~130 MB | Jelas komersial-friendly, tetapi **terlalu besar untuk HP/PWA**; data latih "komersial", tidak diungkap; skor di bawah ArcFace asli. Cadangan untuk verifikasi di server. |

**Pemeriksaan berkas SFace (2026-11-11):** `face_recognition_sface_2021dec_int8.onnx` diunduh dari OpenCV Zoo (9.896.933 byte, sha256 `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a`). README folder menyatakan "all files in this directory are licensed under Apache 2.0" dan LICENSE-nya Apache 2.0 baku (baris hak cipta masih templat kosong, tidak menyebut pemegang hak). Akurasi LFW yang dilaporkan: 0,9932 (kuantisasi int8). **Risiko yang belum tertutup:** lisensi berkas model tidak otomatis mencakup dataset latihnya. Makalah SFace melaporkan pelatihan dengan CASIA-WebFace, VGGFace2, dan MS-Celeb-1M; versi yang dipakai pada bobot OpenCV Zoo tidak ditemukan, dan syarat dataset itu (umumnya riset) belum diperiksa. Dimensi vektor belum diverifikasi dari berkas (akan dicek saat model dijalankan).

**Halaman uji lokal (`spike/face-embed/`, dibuat 2026-11-11, bukan bagian aplikasi):** `node spike/face-embed/server.mjs` lalu buka http://localhost:5180/ (atau `HOST=0.0.0.0` untuk HP di jaringan yang sama; kamera di HP butuh HTTPS, tetapi unggah foto tetap bisa). Memakai `onnxruntime-web` 1.31.1 (WASM) untuk SFace dan BlazeFace yang sudah ada di aplikasi untuk menyelaraskan wajah (4 titik: mata, hidung, tengah mulut ke titik acuan 112x112). Berkas model ada di `spike/face-embed/models/` dan **tidak boleh di-commit** (diabaikan git) sampai urusan lisensi data latih selesai. Mengunggah banyak foto per orang menampilkan skor orang sama vs beda, tabel FRR/FAR per ambang, waktu, dan tombol salin hasil.
- Terverifikasi (browser pane desktop): model dan detektor termuat (model 9,4 MB, sesi dibuat 486 ms), **dimensi vektor 128**, norma 1 setelah dinormalisasi, input yang sama menghasilkan kosinus 1,0, **embedding ±430 ms per foto** (WASM 1 thread, tanpa isolasi lintas-origin). Waktu segitu cukup untuk satu kali per presensi, bukan untuk video langsung.
- **Uji di HP nyata (2026-11-11, satu orang: pemilik, Android 10, Chrome 157, HTTPS sertifikat sendiri):** halaman dan kamera jalan. Model termuat 497 ms (lokal), sesi 1.854 ms, detektor 1.222 ms (total ±3,6 detik pertama kali), **embedding median 466 ms** (sama dengan desktop). Template 6 sampel (2 depan + 4 pose); kemiripan antar-sampel template min 0,315 dan rata-rata 0,575 (pose ekstrem tampak berbeda satu sama lain, wajar). Uji cocok 15 kali, wajah yang sama, tanpa catatan kondisi: skor min 0,557, rata-rata 0,909, maks 0,953; tidak ada penolakan pada ambang 0,36.
- **Cara membaca hasil itu:** skor tinggi itu **belum membuktikan akurasi**. Uji dilakukan sesaat setelah pendaftaran (cahaya, hari, dan posisi sama) dan template berisi dua jepretan depan, jadi hampir duplikat. Belum ada data orang lain, jadi tingkat salah-terima (FAR) belum diketahui, dan belum ada variasi kondisi (cahaya redup, kacamata, hari lain, jarak).
- **Belum terverifikasi:** skor orang beda (butuh beberapa orang yang bersedia), variasi kondisi, iPhone dan HP kelas bawah, urutan kanal RGB vs BGR (halaman sekarang memakai RGB; hasil di atas wajar untuk RGB), dan apakah deteksi pose pendaftaran terasa nyaman (ambang gerak 0,2 dan 0,12 masih tebakan).

Kesimpulan sementara: coba **SFace int8** dulu (ukuran dan lisensi paling menjanjikan). Bila lisensi/data latihnya bermasalah atau akurasinya kurang, opsi berikutnya adalah AuraFace (di server, bukan di HP) atau lisensi komersial InsightFace.

Yang masih harus diukur dengan berkas model nyata: waktu hitung di Android kelas menengah dan iPhone, dukungan runtime di browser (kandidat `onnxruntime-web`, WASM; ukuran runtime ikut dihitung), dan distribusi skor orang sama vs berbeda pada sukarelawan.

## Uji dua orang di HP + liveness (2026-11-11, Android 10, Chrome 157)
Dua orang terdaftar (Huda, Widodo; 10 sampel tiap orang dari pendaftaran melingkar), 33 pengukuran video langsung **tanpa kunci jawaban** (mode evaluasi tidak dipakai), ambang kemiripan 0,36, ambang liveness 0,63. Waktu muat HP: model 557 ms, sesi 1.918 ms, detektor 1.561 ms.
- **Bingkai bagus memisahkan dengan jelas.** Dari 16 pengukuran dengan skor tertinggi ≥ 0,6, skor ke orang lainnya semuanya ≤ 0,33 (umumnya 0,11-0,25): celah ±0,3-0,6.
- **Bingkai buruk membuat dua skor berdekatan.** Lima pengukuran punya selisih skor teratas dan kedua < 0,1; dua di antaranya (skor 0,513 vs 0,451 dan 0,413 vs 0,39) **lolos ambang 0,36**, jadi berpotensi salah orang. Ambang tunggal 0,36 terlalu longgar; dibutuhkan juga aturan selisih (mis. ≥ 0,15, dan hasil ragu-ragu bila kurang) dan ambang lebih tinggi untuk bingkai kualitas baik. Angka pastinya baru bisa ditetapkan dari data berlabel.
- Skor rendah cenderung muncul saat **menoleh** (rata-rata 0,44, 5 dari 8 dikenali) dan **buram** (rata-rata 0,50, 10 dari 14) dibanding **menghadap depan** (0,63, 20 dari 25). Delapan pengukuran di bawah ambang. Uji ini memakai video bergerak; presensi nyata mengambil satu foto setelah wajah stabil, jadi hasil ini cenderung pesimistis.
- **Konsistensi pendaftaran Widodo rendah:** kemiripan antar-sampel min 0,023, rata-rata 0,43 (sampel pose ekstrem atau buram). Karena pencocokan memakai skor tertinggi dari semua sampel, sampel buruk bisa menaikkan skor orang lain; perlu gerbang kualitas (ketajaman) dan pembuangan sampel pencilan saat pendaftaran.
- **Liveness:** 33 dari 33 wajah asli lolos (skor 0,95-1,0), jadi tidak ada salah-tolak pada sampel ini. **Belum ada uji serangan** (foto/layar), sehingga kemampuan menolak serangan belum diketahui. Kelas keluaran indeks 1 memang tampak sebagai "asli" (probabilitas ±1 pada wajah asli).
- Penanda "kacamata?" muncul 1 kali (area mata rasio 1,5, bersamaan dengan gelap dan buram), tidak ada bukti itu kacamata. "Agak buram" muncul pada 14 dari 33 karena dibandingkan dengan pendaftaran yang tajam.

**Aturan selisih + gerbang kualitas (ditambahkan ke prototipe 2026-11-11).** Dikenali hanya bila skor teratas ≥ ambang dan unggul ≥ selisih minimum (bawaan 0,15) dari kandidat kedua; jika tidak, "ragu-ragu". Gerbang kualitas (bisa dimatikan): wajah dikenali hanya saat diam ≥ 0,3 detik, menghadap lurus (|yaw| ≤ 0,15), dan ketajaman ≥ 100 (bawaan; bergantung kamera). **Pemutaran ulang atas 33 pengukuran di atas (data tanpa label, hanya indikasi):** tanpa selisih 25 dikenali dan 8 tidak; dengan selisih 0,15 jadi 23 dikenali, 2 ragu-ragu (yang selisihnya 0,062 dan 0,023), 8 tidak; dengan gerbang (ketajaman ≥ 100, tidak menoleh) tersisa 21 pengukuran: 18 dikenali, 3 tidak dikenal, 0 ragu-ragu. Dampaknya pada salah-orang sungguhan baru bisa dinilai dengan uji berlabel.

**Uji HP dengan gerbang kualitas + selisih + liveness (2026-11-11).** Dua template (Huda, Widodo), 36 pengukuran, gerbang aktif, ambang kemiripan 0,36, selisih 0,15, liveness 0,55; hanya wajah Huda yang berada di depan kamera. 7 pengukuran diberi kunci jawaban "Huda": 7 benar, 0 salah orang, 0 ragu-ragu.
- **Identitas:** semua 36 dikenali sebagai Huda, skor 0,78-0,94 (rata-rata 0,884), skor template Widodo (orang beda) 0,19-0,31, selisih 0,55-0,72. Tidak ada kasus ragu-ragu. Dibanding uji tanpa gerbang (rata-rata 0,585), gerbang menghasilkan bingkai bagus secara konsisten. Celah antara orang beda (maks 0,311) dan orang sama (min 0,781) lebar; ambang 0,36 aman tetapi hanya 0,05 di atas skor orang-beda tertinggi, jadi ambang yang lebih tinggi (mis. ±0,5) layak dipertimbangkan setelah ada data orang ketiga.
- **Liveness:** 5 pengukuran berskor asli rendah (0,005-0,169; probabilitas kelas 2 ≈ 0,83-0,99), empat berurutan; keempatnya tetap mengenali Huda dengan skor 0,78-0,86. Pola ini sesuai dengan percobaan foto/layar tetapi **tidak diberi label**, jadi belum terkonfirmasi (bila itu wajah asli, salah-tolaknya 5 dari 36). Wajah asli berlabel: 0,68-0,99 (rata-rata 0,795, lebih rendah daripada uji sebelumnya yang 0,95-1,0), satu pengukuran tak berlabel 0,572 nyaris di ambang 0,55. Bila lima itu memang serangan, celahnya 0,17 (serangan tertinggi) sampai 0,57 (asli terendah), jadi ambang 0,55 terlalu dekat ke wajah asli dan kisaran ±0,3-0,5 lebih aman (perlu data berlabel).
- **Belum teruji:** Widodo sebagai wajah asli (tidak ada satu pun pengukuran), orang ketiga yang tidak terdaftar, serangan berlabel dan bervariasi (foto cetak, layar lain), cahaya redup/kacamata, dan waktu sampai keputusan. Catatan teknis: nilai ketajaman minimum di berkas hasil (370) kemungkinan diubah di akhir sesi karena banyak pengukuran yang tercatat berketajaman 250-340.

## Perbandingan dengan Raray Vision (2026-11-11)
Repo referensi: `dedin7766/rarayvision` (dibaca dari salinan dangkal, kode tidak dijalankan).
- **Arsitektur mereka:** API Python (FastAPI) dengan InsightFace buffalo_l (SCRFD + ArcFace ResNet50, vektor 512), liveness MiniFASNetV2, Docker, MySQL/SQLite. Klien web mengirim **satu bingkai JPEG ke server tiap 150 ms** untuk pengenalan langsung. Keputusan cocok diambil di server.
- **Lisensi:** kode AGPL-3.0 plus kebijakan merek dagang (fork wajib ganti nama/logo). Bobot buffalo_l yang dipakai adalah paket InsightFace yang non-komersial (lihat riset di atas). Menyalin kode mereka ke layanan jaringan kita mewajibkan membuka kode layanan itu; gagasan dan algoritma boleh dipelajari.
- **Catatan mutu kode:** pendaftaran dan banyak endpoint memanggil `check_spoof=False` (liveness mati meski README menjualnya), pengenalan langsung menulis bingkai ke `/tmp` tiap permintaan, banyak jalur menolak lebih dari satu wajah, deteksi kacamata hanya kepadatan tepi Canny (heuristik yang sama kasarnya dengan prototipe kita), masker dari Haar smile, vektor disimpan JSON polos.
- **Yang layak diambil: liveness pasif MiniFASNetV2.** Berkasnya 1.743.581 byte (sha256 `b32929adc2d9c34b9486f8c4c7bc97c1b69bc0ea9befefc380e4faae4e463907`). Diukur di browser pane dengan `onnxruntime-web` WASM: sesi dibuat 60 ms, **inferensi median 10 ms** (embedding SFace ±430-470 ms), keluaran 3 kelas (indeks 1 = asli menurut kode mereka). Cara pakai di kode mereka: potong area sekitar kotak wajah dengan skala 2,7, ubah ke 80x80, BGR 0-255 tanpa normalisasi, softmax, asli bila skor kelas 1 > 0,55. **Belum diketahui:** akurasi pada serangan foto/layar di HP kita, dan lisensi bobotnya (repo mereka tidak menyebut asalnya; namanya cocok dengan proyek Silent-Face-Anti-Spoofing milik minivision, lisensinya harus diperiksa langsung di sumbernya). Salinan lokal ada di `spike/face-embed/models/` (diabaikan git).
- **Kesimpulan efisiensi:** untuk HRIS ini (±30-40 pengguna, Cloudflare Pages + D1 + R2, tanpa server sendiri) pendekatan hybrid di HP lebih efisien: tanpa server Python, tanpa unggah bingkai tiap 150 ms, model 9,4 MB, ±0,5 detik per presensi. Kelemahannya klien tidak sepenuhnya bisa dipercaya dan backbone SFace lebih ringan sehingga kemungkinan kurang akurat daripada ResNet50 (belum kita ukur). Raray Vision unggul di keputusan di server dan backbone lebih kuat, tetapi menambah infrastruktur, trafik biometrik, dan beban lisensi. Rencana: tetap hybrid, tambahkan liveness pasif MiniFASNet di HP setelah lisensi bobot dipastikan; layanan Python gaya Raray hanya dipertimbangkan sebagai verifikasi ulang sampling (Fase 4) dengan model berlisensi.

## Fase berikutnya (ringkas)
- **Fase 2, liveness aktif:** `GET /api/face/challenge` (tantangan acak, sekali pakai, kedaluwarsa singkat), pendeteksian kedip/tengok dengan MediaPipe Face Landmarker, hasil `liveness_ok` disimpan.
- **Fase 3, kalibrasi:** tetapkan `T_match` dan `T_low` dari distribusi skor nyata; laporan uncertain/mismatch.
- **Fase 4 (opsional):** mode `block` dengan jalur keluar lewat koreksi HC; verifikasi ulang sampling di server.

## Batasan yang harus dinyatakan jujur
- Embedding dihitung di HP, sehingga klien yang dimodifikasi bisa mengirim embedding palsu; ini hanya terdeteksi lewat verifikasi ulang dari foto (sampling), bukan saat itu juga.
- Tanpa liveness (sampai Fase 2), foto cetak atau layar di depan kamera bisa lolos.
- Deepfake langsung ke kamera di luar jangkauan aplikasi web.
- Akurasi dapat turun pada cahaya redup, kacamata, hijab, masker; pendaftaran ulang adalah jalurnya, bukan menurunkan ambang.

## Privasi
Template wajah adalah data biometrik (data pribadi spesifik, UU PDP). Syarat: persetujuan eksplisit yang dicatat (waktu dan versi teks), jalur alternatif bagi yang menolak atau gagal dikenali (presensi tetap bisa, ditandai `none`), penghapusan template saat karyawan keluar atau menarik persetujuan, akses admin tercatat di audit, dan tidak ada vektor yang dikirim ke HP.
