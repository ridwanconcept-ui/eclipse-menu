import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import type { AdminRole, AdminUser } from '../shared/types.js';

export const SESSION_COOKIE = 'eclipse_session';
const SESSION_TTL_HOURS = 12;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminUser;
      sessionId?: string;
    }
  }
}

interface SessionRow {
  id: string;
  user_id: number;
  expires_at: string;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function createSession(userId: number): { id: string; expires: Date } {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)').run(
    id,
    userId,
    expires.toISOString().replace('T', ' ').slice(0, 19),
  );
  return { id, expires };
}

export function destroySession(id: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function pruneSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

export function setSessionCookie(req: Request, res: Response, sessionId: string, expires: Date) {
  const secure = (req.headers['x-forwarded-proto'] ?? '').toString().includes('https') || req.secure;
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolve the admin user from the session cookie, if any. */
export function loadAdmin(req: Request): AdminUser | undefined {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid || typeof sid !== 'string') return undefined;
  const session = db
    .prepare(
      `SELECT s.id, s.user_id FROM sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1`,
    )
    .get(sid) as { id: string; user_id: number } | undefined;
  if (!session) return undefined;
  const user = db
    .prepare('SELECT id, business_id, email, name, role FROM admin_users WHERE id = ?')
    .get(session.user_id) as AdminUser | undefined;
  req.sessionId = sid;
  return user;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = loadAdmin(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.admin = user;
  next();
}

export function requireRole(roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.admin.role)) {
      res.status(403).json({ error: 'Your role does not permit this action' });
      return;
    }
    next();
  };
}

/** Naive in-memory rate limiter (per IP + bucket) for sensitive endpoints. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(bucket: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}
