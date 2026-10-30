import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { publicRouter } from './routes/public.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { loadAdmin, pruneSessions } from './auth.js';
import { uploadsDir, DB_FILE } from './db.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const isProd = process.env.NODE_ENV === 'production';
const ROOT = process.cwd();

// Behind the platform proxy: trust forwarded proto/host so QR URLs are HTTPS.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'eclipse-digital-menu', time: new Date().toISOString(), production: isProd });
});

app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// Uploaded images (served with a long cache; filenames are content-unique).
app.use(
  '/uploads',
  express.static(uploadsDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API endpoint' });
});

// ---------- Static frontend ----------
const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  // SPA fallback — customer menu and admin both live under this app.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('API running. Start the Vite dev server (npm run dev:web) for the UI, or run `npm run build` for production.');
  });
}

// ---------- Errors ----------
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error(`[error] ${req.method} ${req.path}:`, message);
  if (res.headersSent) return;
  res.status(500).json({ error: isProd ? 'Something went wrong on our side. Please try again.' : message });
});

pruneSessions();
setInterval(pruneSessions, 60 * 60 * 1000).unref?.();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Eclipse menu API listening on 0.0.0.0:${PORT}`);
  console.log(`Database: ${DB_FILE}`);
  console.log(`Static UI: ${fs.existsSync(distDir) ? distDir : '(dev mode — use Vite on :5173)'}`);
  // Warm the session loader so a bad cookie doesn't crash a request.
  void loadAdmin;
});
