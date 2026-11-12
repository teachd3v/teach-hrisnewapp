// Profil karyawan: definisi kolom personal dan bagian daftar berulang (keluarga, pendidikan, skill, ...), validasi, dan kelengkapan.
// Dipakai server (penentu, memvalidasi) dan klien (membangun form generik). Tidak ada ketergantungan ke database.
import { parseIsoDate } from './leave';

export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'year' | 'tel' | 'digits';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  /** panjang maksimal (teks), atau [min, maks] untuk `digits` */
  max?: number;
  digits?: readonly [number, number];
  /** disamarkan di tampilan (NIK, rekening); nilai penuh hanya di form ubah */
  sensitive?: boolean;
  hint?: string;
}

const MARITAL = ['Belum menikah', 'Menikah', 'Cerai hidup', 'Cerai mati'] as const;
const RELIGIONS = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'] as const;
const BLOOD = ['A', 'B', 'AB', 'O'] as const;
const LEVELS = ['SD', 'SMP', 'SMA/SMK', 'D3', 'D4', 'S1', 'S2', 'S3'] as const;
const SKILL_LEVELS = ['Pemula', 'Menengah', 'Mahir', 'Ahli'] as const;
const LANG_LEVELS = ['Dasar', 'Menengah', 'Lanjut', 'Fasih'] as const;
const RELATIONS = ['Pasangan', 'Anak', 'Ayah', 'Ibu', 'Saudara', 'Lainnya'] as const;

/** Kolom personal (tabel employees). Agama dan golongan darah opsional. */
export const PERSONAL_FIELDS: readonly FieldDef[] = [
  { key: 'phone', label: 'Telepon', type: 'tel' },
  { key: 'nik', label: 'NIK (KTP)', type: 'digits', digits: [16, 16], sensitive: true, hint: '16 digit' },
  { key: 'birth_place', label: 'Tempat lahir', type: 'text', max: 60 },
  { key: 'birth_date', label: 'Tanggal lahir', type: 'date' },
  { key: 'nationality', label: 'Kewarganegaraan', type: 'text', max: 40 },
  { key: 'marital_status', label: 'Status pernikahan', type: 'select', options: MARITAL },
  { key: 'religion', label: 'Agama (opsional)', type: 'select', options: RELIGIONS },
  { key: 'blood_type', label: 'Golongan darah (opsional)', type: 'select', options: BLOOD },
  { key: 'address', label: 'Alamat domisili', type: 'textarea', max: 250 },
  { key: 'city', label: 'Kota/Kabupaten', type: 'text', max: 60 },
  { key: 'province', label: 'Provinsi', type: 'text', max: 60 },
  { key: 'postal_code', label: 'Kode pos', type: 'digits', digits: [5, 5] },
  { key: 'ktp_address', label: 'Alamat sesuai KTP', type: 'textarea', max: 250 },
  { key: 'bank_name', label: 'Nama bank', type: 'text', max: 60 },
  { key: 'bank_account_no', label: 'Nomor rekening', type: 'digits', digits: [5, 20], sensitive: true },
  { key: 'bank_account_name', label: 'Nama pemilik rekening', type: 'text', max: 80 },
];
export const PERSONAL_KEYS = PERSONAL_FIELDS.map((f) => f.key);

export type ProfileGroup = 'personal' | 'family' | 'edu' | 'activity' | 'docs';
export const PROFILE_GROUPS: readonly { key: ProfileGroup; label: string }[] = [
  { key: 'personal', label: 'Personal' },
  { key: 'family', label: 'Keluarga' },
  { key: 'edu', label: 'Edukasi' },
  { key: 'activity', label: 'Aktivitas' },
  { key: 'docs', label: 'Dokumen' },
];

export interface SectionDef {
  key: string;
  group: Exclude<ProfileGroup, 'personal' | 'docs'>;
  label: string;
  /** nama satu butir untuk tombol "Tambah ..." */
  item: string;
  fields: readonly FieldDef[];
  /** kolom untuk judul dan baris keterangan di kartu */
  title: string;
  subtitle: readonly string[];
  /** hanya HC/super admin yang boleh menambah/mengubah; karyawan melihat saja */
  hcOnly?: boolean;
}

const t = (key: string, label: string, required = false, max = 100): FieldDef => ({ key, label, type: 'text', required, max });
const d = (key: string, label: string, required = false): FieldDef => ({ key, label, type: 'date', required });
const y = (key: string, label: string, required = false): FieldDef => ({ key, label, type: 'year', required });
const sel = (key: string, label: string, options: readonly string[], required = false): FieldDef => ({ key, label, type: 'select', options, required });

export const PROFILE_SECTIONS: readonly SectionDef[] = [
  // Keluarga
  { key: 'emergency_contact', group: 'family', label: 'Kontak darurat', item: 'kontak darurat', title: 'name', subtitle: ['relationship', 'phone'],
    fields: [t('name', 'Nama', true), t('relationship', 'Hubungan', true, 40), { key: 'phone', label: 'Telepon', type: 'tel', required: true }, { key: 'address', label: 'Alamat', type: 'textarea', max: 250 }] },
  { key: 'family', group: 'family', label: 'Anggota keluarga', item: 'anggota keluarga', title: 'name', subtitle: ['relationship', 'occupation'],
    fields: [sel('relationship', 'Hubungan', RELATIONS, true), t('name', 'Nama', true), d('birth_date', 'Tanggal lahir'), t('occupation', 'Pekerjaan', false, 60), { key: 'phone', label: 'Telepon', type: 'tel' }] },
  // Edukasi & skill
  { key: 'education', group: 'edu', label: 'Pendidikan formal', item: 'pendidikan', title: 'institution', subtitle: ['level', 'field', 'year'],
    fields: [sel('level', 'Jenjang', LEVELS, true), t('institution', 'Institusi', true), t('field', 'Jurusan', false, 80), y('year', 'Tahun lulus')] },
  { key: 'non_formal', group: 'edu', label: 'Pendidikan non-formal', item: 'pendidikan non-formal', title: 'name', subtitle: ['institution', 'year'],
    fields: [t('name', 'Nama', true), t('institution', 'Penyelenggara', false, 80), y('year', 'Tahun')] },
  { key: 'training', group: 'edu', label: 'Pelatihan', item: 'pelatihan', title: 'name', subtitle: ['provider', 'date'],
    fields: [t('name', 'Nama pelatihan', true), t('provider', 'Penyelenggara', false, 80), d('date', 'Tanggal')] },
  { key: 'skill', group: 'edu', label: 'Keterampilan', item: 'keterampilan', title: 'name', subtitle: ['proficiency'],
    fields: [t('name', 'Keterampilan', true, 80), sel('proficiency', 'Tingkat', SKILL_LEVELS)] },
  { key: 'language', group: 'edu', label: 'Bahasa', item: 'bahasa', title: 'name', subtitle: ['proficiency'],
    fields: [t('name', 'Bahasa', true, 40), sel('proficiency', 'Tingkat', LANG_LEVELS)] },
  // Aktivitas & prestasi
  { key: 'work_experience', group: 'activity', label: 'Pengalaman kerja', item: 'pengalaman kerja', title: 'company', subtitle: ['position', 'start_date', 'end_date'],
    fields: [t('company', 'Perusahaan', true, 80), t('position', 'Posisi', true, 80), d('start_date', 'Mulai'), d('end_date', 'Selesai'), { key: 'description', label: 'Deskripsi', type: 'textarea', max: 400 }] },
  { key: 'org_experience', group: 'activity', label: 'Organisasi', item: 'organisasi', title: 'organization', subtitle: ['role', 'period'],
    fields: [t('organization', 'Organisasi', true, 80), t('role', 'Jabatan/peran', false, 60), t('period', 'Periode', false, 40)] },
  { key: 'committee', group: 'activity', label: 'Kepanitiaan', item: 'kepanitiaan', title: 'event', subtitle: ['role', 'year'],
    fields: [t('event', 'Acara', true, 80), t('role', 'Peran', false, 60), y('year', 'Tahun')] },
  { key: 'social_activity', group: 'activity', label: 'Kegiatan sosial', item: 'kegiatan sosial', title: 'activity', subtitle: ['organization', 'role'],
    fields: [t('activity', 'Kegiatan', true, 80), t('organization', 'Organisasi', false, 80), t('role', 'Peran', false, 60), d('start_date', 'Mulai'), d('end_date', 'Selesai')] },
  { key: 'achievement', group: 'activity', label: 'Prestasi', item: 'prestasi', title: 'title', subtitle: ['level', 'date'],
    fields: [t('title', 'Prestasi', true, 100), t('level', 'Tingkat', false, 40), d('date', 'Tanggal'), { key: 'description', label: 'Deskripsi', type: 'textarea', max: 400 }] },
  { key: 'career_interest', group: 'activity', label: 'Minat karier', item: 'minat karier', title: 'position', subtitle: ['department'],
    fields: [t('position', 'Posisi yang diminati', true, 80), t('department', 'Departemen', false, 60)] },
  { key: 'promotion', group: 'activity', label: 'Riwayat promosi (diisi HC)', item: 'riwayat promosi', hcOnly: true, title: 'type', subtitle: ['from_position', 'to_position', 'date'],
    fields: [d('date', 'Tanggal', true), t('type', 'Jenis (mis. Promosi, Mutasi)', true, 40), t('from_position', 'Dari posisi', false, 80), t('to_position', 'Ke posisi', false, 80)] },
];

export const sectionOf = (key: string) => PROFILE_SECTIONS.find((s) => s.key === key);
/** Batas jumlah butir per bagian per karyawan (mencegah penyalahgunaan). */
export const MAX_ENTRIES_PER_SECTION = 50;

// ------------------------------------------------------------------ validasi

export type ValidationResult = { ok: true; data: Record<string, string | null> } | { ok: false; error: string };

const todayIso = () => new Date().toISOString().slice(0, 10);

function checkValue(def: FieldDef, v: string): string | null {
  switch (def.type) {
    case 'text': case 'textarea':
      return v.length > (def.max ?? 100) ? `${def.label} maksimal ${def.max ?? 100} karakter` : null;
    case 'tel':
      return /^[0-9+()\-\s]{6,20}$/.test(v) ? null : `${def.label} tidak valid (6-20 karakter angka, +, -, spasi)`;
    case 'digits': {
      const [min, max] = def.digits ?? [1, 30];
      return /^\d+$/.test(v) && v.length >= min && v.length <= max ? null : `${def.label} harus ${min === max ? `${min} digit angka` : `${min}-${max} digit angka`}`;
    }
    case 'date':
      return parseIsoDate(v) ? null : `${def.label} tidak valid`;
    case 'year':
      return /^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2100 ? null : `${def.label} tidak valid (4 digit)`;
    case 'select':
      return def.options?.includes(v) ? null : `${def.label} tidak valid`;
  }
}

/**
 * Validasi dan rapikan masukan menurut definisi kolom. Hanya kolom yang dikenal yang dikembalikan; teks dipangkas, kosong menjadi null.
 * `partial`: kolom yang tidak dikirim dilewati (untuk ubah sebagian); kolom wajib tetap tidak boleh dikosongkan bila dikirim.
 */
export function validateFields(defs: readonly FieldDef[], input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const data: Record<string, string | null> = {};
  for (const def of defs) {
    if (!(def.key in input)) {
      if (opts.partial) continue;
      if (def.required) return { ok: false, error: `${def.label} wajib diisi` };
      data[def.key] = null;
      continue;
    }
    const raw = input[def.key];
    if (raw !== null && typeof raw !== 'string' && typeof raw !== 'number') return { ok: false, error: `${def.label} tidak valid` };
    const v = raw === null ? '' : String(raw).trim().replace(def.type === 'textarea' ? /[ \t]+/g : /\s+/g, ' ');
    if (v === '') {
      if (def.required) return { ok: false, error: `${def.label} wajib diisi` };
      data[def.key] = null;
      continue;
    }
    const err = checkValue(def, v);
    if (err) return { ok: false, error: err };
    if (def.key === 'birth_date' && (v > todayIso() || v < '1900-01-01')) return { ok: false, error: 'Tanggal lahir tidak valid' };
    data[def.key] = v;
  }
  return { ok: true, data };
}

// ------------------------------------------------------------------ tampilan

/** Samarkan nilai sensitif: tampilkan 4 karakter terakhir saja. */
export const maskTail = (v: string | null | undefined, keep = 4) => (v ? `${'•'.repeat(Math.max(v.length - keep, 4))}${v.slice(-keep)}` : '');

// ------------------------------------------------------------------ kelengkapan

/** Kolom personal yang dihitung untuk kelengkapan (agama dan golongan darah opsional, tidak dihitung). */
const COMPLETENESS_PERSONAL = ['phone', 'nik', 'birth_place', 'birth_date', 'marital_status', 'address', 'city', 'province', 'ktp_address', 'bank_name', 'bank_account_no', 'bank_account_name'] as const;

/** Indikator kelengkapan (tidak memblokir apa pun): persen dan daftar yang belum terisi. */
export function profileCompleteness(
  personal: Record<string, string | null | undefined>,
  entryCounts: Record<string, number>,
  hasPhoto: boolean,
): { percent: number; missing: string[] } {
  const labelOf = (k: string) => PERSONAL_FIELDS.find((f) => f.key === k)?.label ?? k;
  const items: { label: string; done: boolean }[] = [
    ...COMPLETENESS_PERSONAL.map((k) => ({ label: labelOf(k), done: Boolean(personal[k]) })),
    { label: 'Kontak darurat', done: (entryCounts.emergency_contact ?? 0) > 0 },
    { label: 'Pendidikan', done: (entryCounts.education ?? 0) > 0 },
    { label: 'Foto profil', done: hasPhoto },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), missing: items.filter((i) => !i.done).map((i) => i.label) };
}

// ------------------------------------------------------------------ dokumen

export interface DocumentCategory { key: string; label: string; /** hanya HC yang mengunggah; karyawan melihat saja */ hcOnly?: boolean }
export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  { key: 'ktp', label: 'KTP' },
  { key: 'kk', label: 'Kartu Keluarga' },
  { key: 'npwp', label: 'NPWP' },
  { key: 'ijazah', label: 'Ijazah' },
  { key: 'sertifikat', label: 'Sertifikat' },
  { key: 'pekerjaan', label: 'Dokumen pekerjaan' },
  { key: 'prestasi', label: 'Prestasi' },
  { key: 'kontrak', label: 'Kontrak kerja', hcOnly: true },
  { key: 'sk', label: 'Surat keputusan (SK)', hcOnly: true },
  { key: 'lainnya', label: 'Lainnya' },
];
export const documentCategory = (key: string) => DOCUMENT_CATEGORIES.find((c) => c.key === key);
/** Batas jumlah dokumen per karyawan dan ukuran tiap berkas (PDF/JPG/PNG/WEBP). */
export const MAX_DOCUMENTS = 30;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_TITLE_MAX = 100;
