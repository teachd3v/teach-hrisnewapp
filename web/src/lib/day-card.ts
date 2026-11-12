/**
 * Penggambar kartu "Selesai hari ini" (tata letak Polaroid) ke canvas 1080x1920 (rasio cerita 9:16).
 * Kartu hanya memuat foto, jam, durasi, kutipan, dan nama depan. Lokasi, status, dan hasil verifikasi wajah sengaja tidak ikut.
 * Gambar yang sama dipakai untuk pratinjau dan untuk dibagikan, jadi apa yang terlihat = apa yang terkirim.
 */
export interface DayCardData {
  firstName: string;
  /** Tanggal WIB, YYYY-MM-DD. */
  date: string;
  inTime: string;
  outTime: string;
  duration: string;
  /** Jumlah hari tepat waktu bulan ini sampai tanggal kartu; lencana hanya tampil bila >= 3. */
  onTimeDays: number;
  quote: string;
  /** null = tanpa foto (inisial). */
  inPhoto: ImageBitmap | null;
  outPhoto: ImageBitmap | null;
  /** Wallpaper pengguna sebagai latar kartu (null = latar gradasi bawaan) dan keburamannya, 0..1 (1 - transparansi). */
  wallpaper?: ImageBitmap | null;
  wallpaperAlpha?: number;
}

export const CARD_W = 1080;
export const CARD_H = 1920;
const FONT = '"Plus Jakarta Sans Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Isi kotak dengan gambar terpotong rapi (object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Pecah teks menjadi baris yang muat dalam `maxW`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function polaroid(ctx: CanvasRenderingContext2D, o: { cx: number; cy: number; angle: number; label: string; photo: ImageBitmap | null; initial: string }) {
  const W = 400, H = 500, PAD = 20, PH = 400;
  ctx.save();
  ctx.translate(o.cx, o.cy);
  ctx.rotate((o.angle * Math.PI) / 180);
  ctx.shadowColor = 'rgba(30, 41, 59, 0.22)';
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -W / 2, -H / 2, W, H, 14);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const px = -W / 2 + PAD, py = -H / 2 + PAD, pw = W - PAD * 2;
  ctx.save();
  roundRect(ctx, px, py, pw, PH, 8);
  ctx.clip();
  if (o.photo) {
    drawCover(ctx, o.photo, px, py, pw, PH);
  } else {
    const g = ctx.createLinearGradient(px, py, px + pw, py + PH);
    g.addColorStop(0, '#cbd5e1');
    g.addColorStop(1, '#94a3b8');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, pw, PH);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 180px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.initial, px + pw / 2, py + PH / 2 + 8);
  }
  ctx.restore();

  ctx.fillStyle = '#1e293b';
  ctx.font = `800 36px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(o.label, 0, H / 2 - 28);
  ctx.restore();
}

export async function renderDayCard(d: DayCardData): Promise<Blob> {
  // Pastikan huruf aplikasi sudah dimuat sebelum menggambar (kalau belum, kartu akan memakai huruf sistem).
  await Promise.all(['500', '700', '800'].map((w) => document.fonts.load(`${w} 40px "Plus Jakarta Sans Variable"`).catch(() => [])));

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia di perangkat ini');

  const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.3, CARD_H);
  bg.addColorStop(0, '#eef2ff');
  bg.addColorStop(0.55, '#dbeafe');
  bg.addColorStop(1, '#fce7f3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (d.wallpaper) {
    ctx.save();
    ctx.globalAlpha = d.wallpaperAlpha ?? 1; // sama seperti di aplikasi: wallpaper di atas gradasi bawaan, sebesar (1 - transparansi)
    drawCover(ctx, d.wallpaper, 0, 0, CARD_W, CARD_H);
    ctx.restore();
  }

  const initial = (d.firstName[0] ?? '?').toUpperCase();
  const dateLabel = new Date(`${d.date}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

  // Kepala
  ctx.fillStyle = '#1e293b';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('TEACH HRIS', 80, 130);
  ctx.textAlign = 'right';
  ctx.fillText(dateLabel, CARD_W - 80, 130);

  // Judul (dikecilkan bila nama panjang)
  const title = `Selesai hari ini, ${d.firstName}!`;
  let size = 72;
  ctx.textAlign = 'center';
  do { ctx.font = `800 ${size}px ${FONT}`; size -= 4; } while (ctx.measureText(title).width > CARD_W - 160 && size > 36);
  ctx.fillText(title, CARD_W / 2, 270);

  // Dua foto
  polaroid(ctx, { cx: 300, cy: 650, angle: -3.5, label: `Masuk ${d.inTime}`, photo: d.inPhoto, initial });
  polaroid(ctx, { cx: 780, cy: 720, angle: 3.5, label: `Pulang ${d.outTime}`, photo: d.outPhoto, initial });

  // Durasi (bila ada wallpaper: selubung putih tipis agar tetap terbaca di atas gambar ramai)
  const wp = Boolean(d.wallpaper);
  if (wp) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    roundRect(ctx, 150, 1040, CARD_W - 300, 290, 64);
    ctx.fill();
  }
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.font = `800 170px ${FONT}`;
  ctx.fillText(d.duration, CARD_W / 2, 1200);
  ctx.fillStyle = wp ? '#1e293b' : '#475569';
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText('kerja hari ini', CARD_W / 2, 1290);

  // Lencana (hanya pencapaian positif)
  let nextY = 1360;
  if (d.onTimeDays >= 3) {
    const text = `${d.onTimeDays} hari tepat waktu bulan ini`;
    ctx.font = `700 36px ${FONT}`;
    const w = ctx.measureText(text).width + 80;
    ctx.fillStyle = '#dcfce7';
    roundRect(ctx, (CARD_W - w) / 2, nextY, w, 76, 38);
    ctx.fill();
    ctx.fillStyle = '#166534';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CARD_W / 2, nextY + 40);
    ctx.textBaseline = 'alphabetic';
    nextY += 76 + 56;
  } else {
    nextY += 20;
  }

  // Kutipan
  ctx.font = `700 50px ${FONT}`;
  const lines = wrap(ctx, `"${d.quote}"`, 800);
  const lh = 70;
  const boxH = lines.length * lh + 90;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  roundRect(ctx, 70, nextY, CARD_W - 140, boxH, 44);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, CARD_W / 2, nextY + 45 + lh * (i + 0.78)));

  // Kaki
  ctx.font = `700 32px ${FONT}`;
  if (wp) {
    const fw = ctx.measureText('IT TEACH GREAT Edunesia').width + 64;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    roundRect(ctx, (CARD_W - fw) / 2, CARD_H - 116, fw, 62, 31);
    ctx.fill();
  }
  ctx.fillStyle = wp ? '#1e293b' : '#475569';
  ctx.fillText('IT TEACH GREAT Edunesia', CARD_W / 2, CARD_H - 73);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), 'image/png'));
}
