// Migrasi profil dan dokumen karyawan dari sistem lama (hrteach.site) ke HRIS baru. Lihat docs/MIGRASI.md.
// Tiga langkah, semuanya baca-saja terhadap sistem lama; hasilnya ditulis ke folder keluaran (di luar repo, berisi data pribadi):
//   npx tsx api/scripts/migrate-from-old.ts plan <export.sql> <outDir>      daftar berkas R2 yang harus disalin + laporan
//   npx tsx api/scripts/migrate-from-old.ts copy <outDir>                   salin berkas R2 lama -> bucket baru (butuh wrangler login)
//   MIG_TEMP_PASSWORD='...' npx tsx api/scripts/migrate-from-old.ts sql <export.sql> <outDir>   buat migrate.sql (idempoten)
// Laporan hanya memuat jumlah dan nama kolom, tidak pernah nilai pribadi (NIK, rekening, dst.).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { PERSONAL_FIELDS, PROFILE_SECTIONS, documentCategory, validateFields, type FieldDef } from '../../shared/src/profile';

// ---- konfigurasi cakupan
const DEPARTMENT = 'REMO';
const TOP_LEADER = 'Haryo Mojopahit';
const CHIEF = 'Nurhadi Widodo'; // atasan langsung semua karyawan departemen
const EXTRA_NAMES = [TOP_LEADER];
const OLD_BUCKET = 'hris-teachapp-storage';
const NEW_BUCKET = 'hris-spa-storage';
const NEW_DB = 'hris-spa-db';

const OLD_TO_SECTION: Record<string, string> = {
  family_members: 'family', emergency_contacts: 'emergency_contact', educations: 'education', non_formal_educations: 'non_formal',
  trainings: 'training', skills: 'skill', languages: 'language', work_experiences: 'work_experience', org_experiences: 'org_experience',
  committee_experiences: 'committee', social_activities: 'social_activity', achievements: 'achievement', career_interests: 'career_interest',
  promotion_histories: 'promotion',
};
const DOC_CATEGORY: Record<string, string> = { Pendidikan: 'ijazah', Pelatihan: 'sertifikat', Pekerjaan: 'pekerjaan', Prestasi: 'prestasi', Lainnya: 'lainnya' };
const CONTENT_TYPE: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

type Row = Record<string, string | number | null>;
const [cmd, a1, a2] = process.argv.slice(2);
const q = (v: unknown) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const clean = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

function loadOld(file: string) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(file, 'utf8'));
  const all = (s: string, ...p: (string | number)[]) => db.prepare(s).all(...p) as Row[];
  const emps = all('SELECT * FROM employees').filter((e) => e.dept === DEPARTMENT || EXTRA_NAMES.includes(String(e.name)));
  if (!emps.some((e) => e.name === TOP_LEADER)) throw new Error(`${TOP_LEADER} tidak ada di ekspor`);
  if (!emps.some((e) => e.name === CHIEF)) throw new Error(`${CHIEF} tidak ada di ekspor`);
  return { all, emps };
}

/** Kunci R2 lama dari URL berkas lama: "/storage/documents/{id}/x.pdf" atau URL Supabase ".../documents/{id}/x.pdf" -> "documents/{id}/x.pdf". */
const oldKey = (url: string) => { const m = /(documents|avatars)\/[^?#]+/.exec(url); return m ? decodeURIComponent(m[0]) : null; };
const extOf = (s: string) => (s.split('.').pop() ?? '').toLowerCase();

interface FileJob { oldKey: string; newKey: string; contentType: string; kind: 'document' | 'photo' }
interface DocPlan { docId: string; empOldId: string; category: string; title: string; jobs: FileJob[] }

function planFiles(emps: Row[], all: ReturnType<typeof loadOld>['all']) {
  const docs: DocPlan[] = [];
  const photos: { empOldId: string; job: FileJob }[] = [];
  const notes: string[] = [];
  for (const e of emps) {
    const eid = String(e.id);
    const pk = e.photo_url ? oldKey(String(e.photo_url)) : null;
    if (pk) photos.push({ empOldId: eid, job: { oldKey: pk, newKey: `profile_photos/migrated/${eid}/${basename(pk)}`, contentType: CONTENT_TYPE[extOf(pk)] ?? 'application/octet-stream', kind: 'photo' } });
    for (const d of all('SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY created_at', eid)) {
      let list: { url?: string; name?: string }[] = [];
      try { list = JSON.parse(String(d.files || '[]')); } catch { notes.push(`dokumen ${d.id}: kolom files bukan JSON, dipakai file_url saja`); }
      const urls = list.map((f) => String(f.url ?? '')).filter(Boolean);
      if (urls.length === 0 && d.file_url) urls.push(String(d.file_url));
      const jobs: FileJob[] = [];
      for (const u of urls) {
        const k = oldKey(u);
        if (!k) { notes.push(`dokumen ${d.id}: URL berkas tidak dikenali`); continue; }
        if (jobs.some((j) => j.oldKey === k)) continue;
        jobs.push({ oldKey: k, newKey: `employee_documents/migrated/${eid}/${basename(k)}`, contentType: CONTENT_TYPE[extOf(k)] ?? 'application/octet-stream', kind: 'document' });
      }
      let category = DOC_CATEGORY[String(d.category)] ?? 'lainnya';
      if (d.category === 'Identitas') category = /kartu keluarga|\bkk\b/i.test(String(d.title)) && !/ktp/i.test(String(d.title)) ? 'kk' : /npwp/i.test(String(d.title)) ? 'npwp' : /ktp/i.test(String(d.title)) ? 'ktp' : 'lainnya';
      if (!documentCategory(category)) throw new Error(`kategori ${category} tidak ada di DOCUMENT_CATEGORIES`);
      docs.push({ docId: String(d.id), empOldId: eid, category, title: String(d.title ?? 'Dokumen').trim().slice(0, 100) || 'Dokumen', jobs });
    }
  }
  return { docs, photos, notes };
}

function plan(file: string, out: string) {
  const { all, emps } = loadOld(file);
  const { docs, photos, notes } = planFiles(emps, all);
  mkdirSync(out, { recursive: true });
  const jobs = [...docs.flatMap((d) => d.jobs), ...photos.map((p) => p.job)];
  writeFileSync(join(out, 'r2-files.json'), JSON.stringify(jobs, null, 1));
  const cats: Record<string, number> = {};
  for (const d of docs) cats[d.category] = (cats[d.category] ?? 0) + 1;
  const lines = [`karyawan: ${emps.length}`, `dokumen: ${docs.length} (berkas ${docs.reduce((n, d) => n + d.jobs.length, 0)})`, `foto profil: ${photos.length}`, `kategori dokumen: ${JSON.stringify(cats)}`, ...notes];
  writeFileSync(join(out, 'plan-report.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

/** Salin berkas R2 lama -> baru lewat wrangler. Hasil per berkas (ada/tidak, ukuran) ditulis ke copied.json; aman diulang. */
function copy(out: string) {
  const jobs: FileJob[] = JSON.parse(readFileSync(join(out, 'r2-files.json'), 'utf8'));
  const tmpDir = join(out, 'tmp-files');
  mkdirSync(tmpDir, { recursive: true });
  const resultFile = join(out, 'copied.json');
  const done: Record<string, { ok: boolean; size: number }> = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : {};
  const wr = (args: string[]) => execFileSync('npx', ['wrangler', ...args], { stdio: 'pipe', shell: true, encoding: 'utf8' });
  let ok = 0, missing = 0;
  for (const j of jobs) {
    if (done[j.newKey]?.ok) { ok++; continue; }
    const tmp = join(tmpDir, 'current.bin');
    try {
      wr(['r2', 'object', 'get', `${OLD_BUCKET}/${j.oldKey}`, '--remote', '--file', `"${tmp}"`]);
      const size = statSync(tmp).size;
      wr(['r2', 'object', 'put', `${NEW_BUCKET}/${j.newKey}`, '--remote', '--file', `"${tmp}"`, '--content-type', j.contentType]);
      done[j.newKey] = { ok: true, size };
      ok++;
    } catch {
      done[j.newKey] = { ok: false, size: 0 };
      missing++;
      console.log(`TIDAK ADA/GAGAL: ${j.kind} ${j.oldKey.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, '<id>')}`);
    } finally { rmSync(tmp, { force: true }); }
    writeFileSync(resultFile, JSON.stringify(done, null, 1));
  }
  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`selesai: ${ok} berkas tersalin/terverifikasi, ${missing} gagal. Detail di copied.json`);
}

// ---------------------------------------------------------------- SQL
const normSelect = (def: FieldDef, v: string) => def.options?.find((o) => o.toLowerCase() === v.trim().toLowerCase()) ?? v;

// Istilah lama -> pilihan baru (pilihan tingkat dan hubungan di sistem lama berbahasa Inggris/lain).
const SYNONYMS: Record<string, string> = {
  beginner: 'Pemula', intermediate: 'Menengah', advanced: 'Mahir', expert: 'Ahli',
  basic: 'Dasar', fluent: 'Lanjut', native: 'Fasih',
  istri: 'Pasangan', suami: 'Pasangan',
};
const converted: Record<string, number> = {};

/** Validasi satu nilai dengan aturan server; nilai tak valid dibuang dan dihitung di laporan (nama kolom saja). */
function normalize(defs: readonly FieldDef[], input: Record<string, unknown>, where: string, report: Record<string, number>) {
  const out: Record<string, string> = {};
  for (const def of defs) {
    let v = clean(input[def.key]);
    if (v === null) continue;
    if (def.type === 'select') v = normSelect(def, SYNONYMS[v.toLowerCase()] ?? v);
    // Sistem lama menyimpan tahun saja untuk kolom tanggal: dijadikan 1 Januari tahun itu (dilaporkan, bisa dikoreksi di aplikasi).
    if (def.type === 'date' && /^\d{4}$/.test(v)) { v = `${v}-01-01`; converted[`${where}.${def.key}`] = (converted[`${where}.${def.key}`] ?? 0) + 1; }
    // Rentang tahun ("2018-2019", "2018/2019") dipersingkat ke tahun awal.
    if (def.type === 'year' && /^\d{4}\s*[-/]\s*\d{4}$/.test(v)) { v = v.slice(0, 4); converted[`${where}.${def.key}`] = (converted[`${where}.${def.key}`] ?? 0) + 1; }
    const r = validateFields([def], { [def.key]: v });
    if (r.ok) { if (r.data[def.key] !== null) out[def.key] = r.data[def.key]!; } else report[`${where}.${def.key}`] = (report[`${where}.${def.key}`] ?? 0) + 1;
  }
  return out;
}

async function hash(password: string) {
  const ITER = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
  return `pbkdf2$${ITER}$${Buffer.from(salt).toString('base64')}$${Buffer.from(bits).toString('base64')}`;
}

async function sql(file: string, out: string) {
  const password = process.env.MIG_TEMP_PASSWORD;
  if (!password || password.length < 8) throw new Error('Isi MIG_TEMP_PASSWORD (min. 8 karakter)');
  const copiedPath = join(out, 'copied.json');
  if (!existsSync(copiedPath)) throw new Error('copied.json belum ada: jalankan langkah "copy" dulu');
  const copied: Record<string, { ok: boolean; size: number }> = JSON.parse(readFileSync(copiedPath, 'utf8'));
  const { all, emps } = loadOld(file);
  const { docs, photos } = planFiles(emps, all);
  const now = new Date().toISOString();
  const dropped: Record<string, number> = {};
  const stmts: string[] = ['-- Dibuat oleh api/scripts/migrate-from-old.ts. Idempoten: aman dijalankan ulang.'];

  const emailsOf = (e: Row) => [...new Set([clean(e.email), clean(e.institutional_email)].filter(Boolean).map((s) => s!.toLowerCase()))];
  const eidOf = (e: Row) => `(SELECT id FROM employees WHERE lower(email) IN (${emailsOf(e).map(q).join(',')}) ORDER BY created_at LIMIT 1)`;
  const master = (kind: string, name: unknown) => { const n = clean(name); return n && n !== '-' ? `(SELECT id FROM master_options WHERE kind='${kind}' AND lower(name)=lower(${q(n)}) LIMIT 1)` : 'NULL'; };
  const photoOf = new Map(photos.map((p) => [p.empOldId, p.job]));
  const top = emps.find((e) => e.name === TOP_LEADER)!, chief = emps.find((e) => e.name === CHIEF)!;

  for (const e of emps) {
    const eid = String(e.id);
    const emails = emailsOf(e);
    if (emails.length === 0) throw new Error(`karyawan ${eid} tanpa email`);
    const prefEmail = clean(e.institutional_email)?.toLowerCase() ?? emails[0];
    const personal = normalize(PERSONAL_FIELDS, { ...e, bank_name: null }, 'personal', dropped);
    const bankText = clean(e.bank);
    const bm = bankText ? /^(.*?)[\s-]*([0-9]{5,20})\s*$/.exec(bankText) : null;
    if (bankText && !bm) dropped['personal.bank'] = (dropped['personal.bank'] ?? 0) + 1;
    if (bm) Object.assign(personal, normalize(PERSONAL_FIELDS, { bank_name: bm[1].trim() || null, bank_account_no: bm[2] }, 'personal', dropped));
    const photo = photoOf.get(eid);
    const photoKey = photo && copied[photo.newKey]?.ok ? photo.newKey : null;
    const role = String(e.role).toLowerCase() === 'admin' ? 'admin' : 'employee';
    const isTop = e.name === TOP_LEADER;
    const cols: [string, string][] = [
      ['employee_code', q(clean(e.employee_code))], ['phone', q(personal.phone)], ['gender', q(clean(e.gender))], ['title', q(clean(e.title))],
      ['department_id', master('department', e.dept)], ['level_id', master('level', e.level)], ['employment_status_id', master('employment_status', e.status)],
      ['join_date', q(clean(e.join_date))], ['photo_key', q(photoKey)],
      ...Object.keys(personal).filter((k) => k !== 'phone').map((k): [string, string] => [k, q(personal[k])]),
    ];
    const valid = cols.filter(([, v]) => v !== 'NULL');
    // 1) baru: dibuat hanya bila belum ada akun dengan email itu. Id memakai id lama.
    const insertCols = ['id', 'name', 'email', 'role', 'is_top_leader', 'active', 'created_at', 'updated_at', ...valid.map(([c]) => c)];
    const insertVals = [q(eid), q(String(e.name).trim()), q(prefEmail), q(role), isTop ? '1' : '0', '1', q(now), q(now), ...valid.map(([, v]) => v)];
    stmts.push(`INSERT INTO employees (${insertCols.join(', ')}) SELECT ${insertVals.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM employees WHERE lower(email) IN (${emails.map(q).join(',')}));`);
    // 2) ada: menimpa dengan nilai lama yang terisi; peran super admin tidak diturunkan.
    const sets = [`name = ${q(String(e.name).trim())}`, `role = CASE WHEN role = 'super_admin' THEN role ELSE ${q(role)} END`, `is_top_leader = ${isTop ? 1 : 0}`, 'active = 1', `updated_at = ${q(now)}`, ...valid.map(([c, v]) => `${c} = ${v}`)];
    stmts.push(`UPDATE employees SET ${sets.join(', ')} WHERE id = ${eidOf(e)};`);
  }
  // atasan setelah semua karyawan ada
  for (const e of emps) {
    const boss = e === top ? null : e === chief ? top : chief;
    stmts.push(`UPDATE employees SET manager_id = ${boss ? eidOf(boss) : 'NULL'} WHERE id = ${eidOf(e)};`);
  }
  // password sementara yang sama untuk semua, wajib diganti saat masuk pertama; sesi lama dicabut
  const pw = await hash(password);
  for (const e of emps) {
    stmts.push(`INSERT INTO credentials (employee_id, password_hash, must_change_password, password_changed_at, failed_attempts, locked_until) VALUES (${eidOf(e)}, ${q(pw)}, 1, NULL, 0, NULL) ON CONFLICT(employee_id) DO UPDATE SET password_hash = excluded.password_hash, must_change_password = 1, password_changed_at = NULL, failed_attempts = 0, locked_until = NULL;`);
    stmts.push(`DELETE FROM refresh_tokens WHERE employee_id = ${eidOf(e)};`);
  }
  // riwayat profil: hapus hasil migrasi sebelumnya (id 'mig-...'), isi ulang. Isian yang dibuat manual di sistem baru tidak disentuh.
  const counts: Record<string, number> = {};
  for (const e of emps) {
    stmts.push(`DELETE FROM profile_entries WHERE id LIKE 'mig-%' AND employee_id = ${eidOf(e)};`);
    for (const [table, section] of Object.entries(OLD_TO_SECTION)) {
      const def = PROFILE_SECTIONS.find((s) => s.key === section)!;
      all(`SELECT * FROM ${table} WHERE employee_id = ? ORDER BY created_at`, String(e.id)).forEach((row, i) => {
        const data = normalize(def.fields, row, section, dropped);
        const missing = def.fields.find((f) => f.required && !data[f.key]);
        if (missing) { dropped[`${section}.baris-dilewati(${missing.key})`] = (dropped[`${section}.baris-dilewati(${missing.key})`] ?? 0) + 1; return; }
        counts[section] = (counts[section] ?? 0) + 1;
        stmts.push(`INSERT INTO profile_entries (id, employee_id, section, data, sort_order, created_at, updated_at) VALUES (${q(`mig-${table}-${row.id}`)}, ${eidOf(e)}, ${q(section)}, ${q(JSON.stringify(data))}, ${i}, ${q(now)}, ${q(now)});`);
      });
    }
  }
  // dokumen: satu baris per berkas; hanya berkas yang sudah tersalin
  let docRows = 0, docSkipped = 0;
  const owner = new Map(emps.map((e) => [String(e.id), e]));
  for (const e of emps) stmts.push(`DELETE FROM employee_documents WHERE id LIKE 'mig-doc-%' AND employee_id = ${eidOf(e)};`);
  for (const d of docs) {
    d.jobs.forEach((j, i) => {
      const info = copied[j.newKey];
      if (!info?.ok) { docSkipped++; return; }
      docRows++;
      const title = d.jobs.length > 1 ? `${d.title} (${i + 1}/${d.jobs.length})`.slice(0, 100) : d.title;
      stmts.push(`INSERT INTO employee_documents (id, employee_id, category, title, file_key, content_type, size_bytes, uploaded_by, created_at) VALUES (${q(`mig-doc-${d.docId}-${i + 1}`)}, ${eidOf(owner.get(d.empOldId)!)}, ${q(d.category)}, ${q(title)}, ${q(j.newKey)}, ${q(j.contentType)}, ${info.size}, ${eidOf(owner.get(d.empOldId)!)}, ${q(now)}) ON CONFLICT(file_key) DO NOTHING;`);
    });
  }
  writeFileSync(join(out, 'migrate.sql'), stmts.join('\n') + '\n');
  // Cek sebelum menjalankan di produksi (baca saja): akun mana yang sudah ada dan akan ditimpa, beserta isinya sekarang.
  const allEmails = [...new Set(emps.flatMap(emailsOf))];
  writeFileSync(join(out, 'preflight.sql'),
    `SELECT e.name, e.email, e.role, (SELECT count(*) FROM profile_entries p WHERE p.employee_id = e.id) entri, (SELECT count(*) FROM employee_documents d WHERE d.employee_id = e.id) dokumen, (e.photo_key IS NOT NULL) foto FROM employees e WHERE lower(e.email) IN (${allEmails.map(q).join(',')}) ORDER BY e.name;\n`);
  const rep = [
    `karyawan: ${emps.length}`, `baris migrate.sql: ${stmts.length}`, `entri profil: ${JSON.stringify(counts)}`, `dokumen dimasukkan: ${docRows}, dilewati (berkas tidak tersalin): ${docSkipped}`,
    `nilai diubah formatnya (tahun saja -> 1 Januari tahun itu; rentang tahun -> tahun awal): ${JSON.stringify(converted)}`,
    `nilai dibuang karena tidak lolos validasi (bagian.kolom: jumlah): ${JSON.stringify(dropped)}`, `database tujuan: ${NEW_DB} (perintah ada di docs/MIGRASI.md)`,
  ];
  writeFileSync(join(out, 'sql-report.txt'), rep.join('\n') + '\n');
  console.log(rep.join('\n'));
}

if (cmd === 'plan' && a1 && a2) plan(a1, a2);
else if (cmd === 'copy' && a1) copy(a1);
else if (cmd === 'sql' && a1 && a2) await sql(a1, a2);
else { console.error('Pakai: plan <export.sql> <outDir> | copy <outDir> | sql <export.sql> <outDir>'); process.exit(1); }
