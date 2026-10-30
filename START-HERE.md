# Eclipse QR Digital Menu — what's running right now

The full application lives in **`/home/user/eclipse-menu/`**. Full documentation: `eclipse-menu/README.md`.
A developer-oriented walkthrough of the build, schema and deployment is in that README.

## Live in this workspace

| What | Where |
|---|---|
| **Guest menu** (public, no login) | preview on port **5173** → `/` |
| Table-specific QR landing | `/ ?t=<token>` (tokens in Admin → QR codes) |
| Admin dashboard | `/admin` |
| REST API | `:4000/api/...` (the web app proxies `/api` to it) |

### Admin sign-in (seeded)

```
email:    admin@eclipse.local
password: EclipseMenu2026!
```

Change it immediately in **Admin → Settings → Change your password** (this also signs out every device).
To create a different first admin: `ADMIN_EMAIL=you@venue.com ADMIN_PASSWORD='…' npm run seed -- --force`.
Add staff accounts: `npm run admin:create -- --email staff@venue.com --name "Ada" --role manager`.

## What is in the database (your real menu)

* **73 items / 16 categories**, transcribed from your printed menu cards — exact prices:
  Long Island ₦8,000 · Mojito ₦7,000 · Chapman ₦6,000 · Big Heineken ₦5,000 · Hennessy VSOP ₦180,000 ·
  Glenfiddich 21 ₦700,000 · Azul Reposado ₦600,000 · Moët Nectar ₦200,000 · Shisha ₦9,000, etc.
* 1 demo promotion (**Golden Hour**, 20% off selected cocktails, daily 5–11pm) so live discounting is
  visible — edit or delete it in Admin → Promotions.
* 8 QR codes: Main Entrance, Main Bar, VIP 01/02, Table 01–03, Poolside 01.
* Ordering is **off** (browse-only) — turn it on in Admin → Settings when you want the cart.

Nothing is fake: every number on the dashboard is read from SQLite, and every edit you make in the
dashboard appears on the guest menu after a refresh — the printed QR codes never need to change.

## Two things you must do before printing codes

1. **Admin → Settings → Public base URL**: set your real HTTPS domain (e.g. `https://menu.eclipse.ng`),
   or set `PUBLIC_BASE_URL` on the server. The QR screen warns you while it still looks localhost/LAN.
2. Replace the AI-generated hero/product images and logo with your own photography in
   **Admin → Settings** and on each item.

## Run / rebuild / test

```bash
cd /home/user/eclipse-menu
npm run dev        # API :4000 + Vite :5173
npm run build      # production bundle (single Node process serves everything on :4000)
npm start
npm run test       # 69 end-to-end acceptance checks (API must be running)
```

The persistent data lives in `eclipse-menu/data/` (`eclipse.db` + `uploads/`) — back that folder up.
