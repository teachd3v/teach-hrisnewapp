// Cetak SQL untuk membuat super admin pertama. Password dibaca dari env, bukan argumen/chat.
//   SEED_EMAIL=a@b.com SEED_NAME="Nama" SEED_PASSWORD='...' node api/scripts/seed-super-admin.mjs > seed.sql
//   wrangler d1 execute hris-spa-db --remote --file seed.sql   (lalu hapus seed.sql)
import { webcrypto as crypto } from 'node:crypto';

const { SEED_EMAIL, SEED_NAME, SEED_PASSWORD } = process.env;
if (!SEED_EMAIL || !SEED_NAME || !SEED_PASSWORD) {
  console.error('Isi SEED_EMAIL, SEED_NAME, SEED_PASSWORD');
  process.exit(1);
}
const ITER = 100_000;
const b64 = (u8) => Buffer.from(u8).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEED_PASSWORD), 'PBKDF2', false, ['deriveBits']);
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
const hash = `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const id = crypto.randomUUID();
const now = new Date().toISOString();
console.log(`INSERT INTO employees (id, name, email, role, active, created_at, updated_at) VALUES (${q(id)}, ${q(SEED_NAME)}, ${q(SEED_EMAIL.toLowerCase())}, 'super_admin', 1, ${q(now)}, ${q(now)});`);
console.log(`INSERT INTO credentials (employee_id, password_hash, must_change_password) VALUES (${q(id)}, ${q(hash)}, 1);`);
