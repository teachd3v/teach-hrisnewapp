/**
 * Kutipan untuk kartu "Selesai hari ini". Semua kalimat orisinal (bukan kutipan tokoh), bahasa Indonesia, tanpa muatan SARA atau sindiran.
 * DRAF: perlu ditinjau HC sebelum dipakai luas (daftar bacaan ada di docs/KUTIPAN.md, dihasilkan dari berkas ini).
 * Kalimat dibuat <= 100 karakter supaya muat di kartu.
 */
export type QuoteTag = 'semangat' | 'humor' | 'pulang' | 'jumat';
export interface Quote { text: string; tag: QuoteTag }

const q = (tag: QuoteTag, lines: string[]): Quote[] => lines.map((text) => ({ text, tag }));

export const QUOTES: Quote[] = [
  ...q('semangat', [
    'Satu hari lagi selesai dengan baik. Kamu hebat sudah bertahan dan berkarya.',
    'Kerja kerasmu hari ini adalah tabungan untuk hari esok.',
    'Langkah kecil yang konsisten mengalahkan semangat yang cuma sesekali.',
    'Hari ini kamu sudah melakukan yang terbaik, dan itu cukup.',
    'Tidak semua hari mulus, tapi kamu tetap sampai di garis akhir hari ini.',
    'Bangga itu sederhana: menuntaskan apa yang kamu mulai pagi tadi.',
    'Pekerjaan besar selesai dari tugas-tugas kecil yang tidak kamu tunda.',
    'Terima kasih sudah hadir dan peduli pada pekerjaanmu hari ini.',
    'Setiap tugas yang rampung adalah satu bukti bahwa kamu mampu.',
    'Pulanglah dengan kepala tegak, hari ini kamu sudah berkontribusi.',
    'Kualitas dibangun dari kebiasaan baik yang kamu ulang setiap hari.',
    'Kamu bagian dari tim yang membuat pendidikan lebih baik. Itu keren.',
    'Progres sekecil apa pun tetap progres. Selamat atas hari ini!',
    'Hari ini selesai, besok kita lanjutkan dengan tenaga baru.',
    'Istirahat itu bagian dari kerja yang baik. Kamu layak mendapatkannya.',
    'Dari pagi sampai sore, kamu menepati komitmen. Itu patut dirayakan.',
    'Orang hebat bukan yang tak pernah lelah, tapi yang tetap bertanggung jawab.',
    'Kerja bagus hari ini! Simpan semangatnya, besok kita pakai lagi.',
  ]),
  ...q('humor', [
    'Kerjaan sudah beres, sekarang waktunya berdebat dengan diri sendiri: makan apa malam ini?',
    'Laptop ditutup, mode manusia biasa diaktifkan.',
    'Hari ini sukses: tugas selesai, kopi habis, dan sabar masih ada sisa.',
    'Baterai tubuh tinggal 5 persen. Mohon segera colok ke kasur.',
    'Kalau pulang kerja bisa dapat poin, hari ini aku sudah naik level.',
    'Rapat selesai, tugas selesai, tinggal macet yang belum selesai.',
    'Kopi habis, tugas beres. Pulang dengan kepala tegak.',
    'Status hari ini: lelah tapi bahagia, lapar tapi belum tahu mau makan apa.',
    'Rekan kerja boleh banyak, jatah camilan tetap harus adil.',
    'Hari ini aku produktif. Buktinya, kursi kantor sudah hafal bentuk badanku.',
    'Tombol pulang ditekan, notifikasi kerjaan kuabaikan dengan sopan.',
    'Jam pulang adalah waktu favorit semua orang, bahkan yang suka kerja.',
    'Hidup ini seperti spreadsheet: banyak kolom, yang penting totalnya seimbang.',
    'Kalau semangat bisa diunduh, aku pilih versi tanpa iklan dan tanpa tenggat.',
    'Tugas hari ini sudah disimpan. Tinggal aku yang perlu diisi ulang dayanya.',
    'Pulang kerja dulu ya, rebahan sudah memanggil dengan sangat sopan.',
    'Hari ini aku menang melawan tumpukan tugas. Skor: 1-0.',
    'Kalau tugas bisa pulang sendiri, hari ini mereka sudah duluan.',
  ]),
  ...q('pulang', [
    'Waktunya pulang. Hati-hati di jalan dan sampai rumah dengan selamat.',
    'Pekerjaan boleh menunggu sampai besok, keluargamu tidak perlu menunggu.',
    'Tutup hari ini dengan syukur, buka besok dengan semangat.',
    'Selamat beristirahat. Hari ini sudah kamu selesaikan dengan baik.',
    'Pulang dulu, besok lanjut jadi versi terbaik dirimu.',
    'Letakkan beban kerja di kantor, bawa pulang senyum untuk rumah.',
    'Matahari saja terbenam, kamu pun boleh istirahat.',
    'Makan enak, mandi air hangat, tidur nyenyak. Kamu pantas mendapatkannya.',
    'Hari ini selesai. Waktunya bertemu orang-orang tersayang.',
    'Semoga perjalanan pulangmu lancar dan malammu tenang.',
    'Terima kasih untuk hari ini. Sampai jumpa besok, tetap sehat ya.',
    'Pulang dengan hati ringan karena tugas hari ini sudah rampung.',
  ]),
  ...q('jumat', [
    'Jumat itu seperti garis finis kecil. Selamat sudah melewati pekan ini!',
    'Pekan ini selesai. Akhir pekan siap dinikmati tanpa rasa bersalah.',
    'Pekan ini kamu tunaikan dengan baik. Selamat menikmati Jumat sore.',
    'Satu pekan penuh kamu bertahan. Waktunya istirahat yang sebenarnya.',
    'Hari terakhir kerja pekan ini: dikerjakan, selesai, dan layak dirayakan.',
    'Selamat akhir pekan! Istirahat dulu, besok-besok kita beraksi lagi.',
    'Jumat sore adalah musim paling indah di kalender kerja.',
    'Kamu sudah berusaha seminggu penuh. Akhir pekan ini milikmu.',
    'Pekan ini ditutup dengan manis. Terima kasih atas kerja kerasnya.',
    'Jumat selesai, kasur menunggu, dan rencana akhir pekan sudah siap.',
    'Lelah pekan ini diganti dengan istirahat dan waktu bersama keluarga.',
    'Tarik napas, hembuskan: pekan ini kamu lewati dengan hebat.',
  ]),
];

/** Hash FNV-1a 32 bit: sebaran merata dan hasil tetap untuk masukan yang sama. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};

/**
 * Kutipan untuk satu orang pada satu tanggal (WIB, YYYY-MM-DD). Hasilnya tetap: dibuka berkali-kali, kutipannya sama.
 * Hari Jumat: sekitar 70% kutipan Jumat, sisanya umum. Hari lain tidak pernah memakai kutipan Jumat.
 */
export function pickQuote(employeeId: string, date: string): Quote {
  const friday = new Date(`${date}T00:00:00Z`).getUTCDay() === 5;
  const h = hash(`${employeeId}|${date}`);
  const jumat = QUOTES.filter((x) => x.tag === 'jumat');
  const umum = QUOTES.filter((x) => x.tag !== 'jumat');
  if (friday && h % 10 < 7) return jumat[(h >>> 4) % jumat.length]!;
  return umum[(h >>> 4) % umum.length]!;
}
