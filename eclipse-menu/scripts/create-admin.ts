/**
 * Creates an additional administrator (owner / manager / staff).
 *
 *   npm run admin:create -- --email manager@eclipse.local --name "Ada" --role manager
 *
 * The password is read from ADMIN_PASSWORD, or generated and printed once.
 * Never hard-code credentials in the repository.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, nowIso } from '../src/server/db.js';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const email = arg('email')?.toLowerCase();
const name = arg('name') ?? 'Administrator';
const role = (arg('role') ?? 'manager') as 'owner' | 'manager' | 'staff';
const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run admin:create -- --email you@venue.com [--name "Name"] [--role owner|manager|staff]');
  process.exit(1);
}
if (!['owner', 'manager', 'staff'].includes(role)) {
  console.error('Role must be owner, manager or staff.');
  process.exit(1);
}

const business = db.prepare('SELECT id, name FROM businesses ORDER BY id LIMIT 1').get() as
  | { id: number; name: string }
  | undefined;
if (!business) {
  console.error('No business found. Run `npm run seed` first.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM admin_users WHERE lower(email) = lower(?)').get(email) as
  | { id: number }
  | undefined;
if (existing) {
  console.error(`An administrator with ${email} already exists.`);
  process.exit(1);
}

db.prepare(
  `INSERT INTO admin_users (business_id, email, name, password_hash, role, created_at)
   VALUES (?,?,?,?,?,?)`,
).run(business.id, email, name, bcrypt.hashSync(password, 12), role, nowIso());

console.log(`\n✅ Administrator created for ${business.name}`);
console.log(`   Email    : ${email}`);
console.log(`   Role     : ${role}`);
console.log(`   Password : ${password}`);
console.log('\n   Share the password through a secure channel and ask them to change it after signing in.\n');
