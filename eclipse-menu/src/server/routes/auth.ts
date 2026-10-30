import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import {
  createSession,
  destroySession,
  clearSessionCookie,
  hashPassword,
  loadAdmin,
  rateLimit,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { loginSchema, passwordChangeSchema, fieldErrors } from '../validation.js';
import type { AdminUser } from '../../shared/types.js';

export const authRouter = Router();

authRouter.post('/login', rateLimit('login', 8, 10 * 60 * 1000), (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid credentials format', fields: fieldErrors(parsed.error) });
    return;
  }
  const { email, password } = parsed.data;
  const user = db
    .prepare('SELECT id, business_id, email, name, role, password_hash, is_active FROM admin_users WHERE lower(email) = lower(?)')
    .get(email) as
    | (AdminUser & { password_hash: string; is_active: number })
    | undefined;

  // Constant-ish response to avoid account enumeration.
  if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }

  const session = createSession(user.id);
  setSessionCookie(req, res, session.id, session.expires);
  res.json({
    user: { id: user.id, business_id: user.business_id, email: user.email, name: user.name, role: user.role },
  });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  const sid = req.cookies?.['eclipse_session'];
  if (typeof sid === 'string') destroySession(sid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const user = loadAdmin(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  res.json({ user });
});

authRouter.post('/password', requireAuth, (req: Request, res: Response) => {
  const parsed = passwordChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const row = db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(req.admin!.id) as {
    password_hash: string;
  };
  if (!verifyPassword(parsed.data.current_password, row.password_hash)) {
    res.status(400).json({ error: 'Your current password is incorrect', fields: { current_password: 'Incorrect password' } });
    return;
  }
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(
    hashPassword(parsed.data.new_password),
    req.admin!.id,
  );
  // Invalidate all other sessions belonging to this user.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.admin!.id);
  clearSessionCookie(res);
  res.json({ ok: true, message: 'Password updated. Please sign in again.' });
});
